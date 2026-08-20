import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPackageExports,
  exportsEqual,
  loadPublicModuleRegistry,
} from '../public-module-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');
const distRoot = resolve(packageRoot, 'dist');
const violations = [];
const registry = await loadPublicModuleRegistry();

const forbiddenPackages = [
  '@resultsafe/core-fp-option-shared',
  '@resultsafe/core-fp-result-shared',
  '@resultsafe/core-fp-union',
];

const collectFiles = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

const requireFile = async (target, label) => {
  if (typeof target !== 'string' || !target.startsWith('./')) {
    violations.push(`[PACKAGE] ${label} must be a relative file target`);
    return;
  }

  try {
    await access(resolve(distRoot, target));
  } catch {
    violations.push(`[PACKAGE] ${label} points to missing file "${target}"`);
  }
};

const validateExportTargets = async (value, label) => {
  if (typeof value === 'string') {
    await requireFile(value, label);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    violations.push(`[PACKAGE] ${label} has an invalid export target`);
    return;
  }
  for (const [condition, target] of Object.entries(value)) {
    await validateExportTargets(target, `${label}.${condition}`);
  }
};

let distPackageJson;
try {
  distPackageJson = JSON.parse(await readFile(resolve(distRoot, 'package.json'), 'utf8'));
} catch (error) {
  violations.push(`[PACKAGE] cannot read dist/package.json: ${error.message}`);
}

if (distPackageJson) {
  for (const field of ['name', 'version', 'description', 'license', 'repository', 'bugs', 'homepage']) {
    if (!distPackageJson[field]) violations.push(`[PACKAGE] missing metadata field "${field}"`);
  }
  for (const field of ['main', 'module', 'browser', 'types']) {
    await requireFile(distPackageJson[field], field);
  }
  const expectedExports = createPackageExports(registry, { packed: true });
  if (!exportsEqual(distPackageJson.exports, expectedExports)) {
    violations.push('[PACKAGE] exports do not exactly match the public module registry');
  }
  await validateExportTargets(distPackageJson.exports, 'exports');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (distPackageJson[field] && Object.keys(distPackageJson[field]).length > 0) {
      violations.push(`[PACKAGE] ${field} must be empty for this zero-dependency package`);
    }
  }
}

try {
  const cjsPackageJson = JSON.parse(
    await readFile(resolve(distRoot, 'cjs', 'package.json'), 'utf8'),
  );
  if (cjsPackageJson.type !== 'commonjs') {
    violations.push('[CJS] cjs/package.json must declare "type": "commonjs"');
  }
} catch (error) {
  violations.push(`[CJS] cannot read cjs/package.json: ${error.message}`);
}

let artifactFiles = [];
try {
  artifactFiles = await collectFiles(distRoot);
} catch (error) {
  violations.push(`[DIST] cannot scan dist: ${error.message}`);
}

const jsFiles = artifactFiles.filter((path) => /\.(?:js|mjs|cjs)$/.test(path));
const dtsFiles = artifactFiles.filter((path) => path.endsWith('.d.ts'));
if (jsFiles.length === 0) violations.push('[JS] no JavaScript artifacts found');
if (dtsFiles.length === 0) violations.push('[DTS] no declaration artifacts found');

const specifierPattern = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
for (const path of [...jsFiles, ...dtsFiles]) {
  const content = await readFile(path, 'utf8');
  for (const match of content.matchAll(specifierPattern)) {
    const specifier = match[1];
    if (forbiddenPackages.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
      const kind = path.endsWith('.d.ts') ? 'DTS' : 'JS';
      violations.push(
        `[${kind}] ${relative(distRoot, path)}: forbidden import "${specifier}"`,
      );
    }
    if (
      !path.endsWith('.d.ts') &&
      !specifier.startsWith('.') &&
      !specifier.startsWith('/') &&
      !specifier.startsWith('node:')
    ) {
      violations.push(
        `[JS] ${relative(distRoot, path)}: zero-dependency artifact has bare import "${specifier}"`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Release artifact validation failed.');
  for (const line of violations) console.error(`- ${line}`);
  process.exit(1);
}

console.log('Release artifact validation passed.');

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPackageExports,
  loadPublicModuleRegistry,
} from '../public-module-registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..', '..');
const distRoot = resolve(packageRoot, 'dist');

const packageJsonPath = resolve(packageRoot, 'package.json');
const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
const packageJson = JSON.parse(packageJsonRaw);

const toDistPath = (path) => path.replace(/^(?:\.\/)?dist\//, './');
const registry = await loadPublicModuleRegistry();

const distPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  author: packageJson.author,
  license: packageJson.license,
  type: packageJson.type ?? 'module',
  sideEffects: packageJson.sideEffects ?? false,
  repository: packageJson.repository,
  bugs: packageJson.bugs,
  homepage: packageJson.homepage,
  engines: packageJson.engines,
  keywords: packageJson.keywords,
  main: toDistPath(packageJson.main),
  module: toDistPath(packageJson.module),
  browser: toDistPath(packageJson.browser),
  types: toDistPath(packageJson.types),
  exports: createPackageExports(registry, { packed: true }),
  files: [
    'cjs',
    'esm',
    'types',
    'umd',
    'docs',
    'README.md',
    'README.ru.md',
    'LICENSE',
  ],
};

await mkdir(distRoot, { recursive: true });
await writeFile(
  resolve(distRoot, 'package.json'),
  `${JSON.stringify(distPackageJson, null, 2)}\n`,
  'utf8',
);

await cp(resolve(packageRoot, 'README.md'), resolve(distRoot, 'README.md'), {
  force: true,
});
await cp(resolve(packageRoot, 'README.ru.md'), resolve(distRoot, 'README.ru.md'), {
  force: true,
});
await cp(resolve(packageRoot, 'LICENSE'), resolve(distRoot, 'LICENSE'), {
  force: true,
});

const docsSrc = resolve(packageRoot, 'docs');
const docsDst = resolve(distRoot, 'docs');
await cp(docsSrc, docsDst, { recursive: true, force: true });

// Add UTF-8 BOM to all Markdown files for proper encoding on unpkg/npm
const addUtf8BomScript = resolve(packageRoot, '__scripts__/build/add-utf8-bom.mjs');
try {
  await import(`file:///${addUtf8BomScript.replace(/\\/g, '/')}`);
} catch (error) {
  // BOM script is in root scripts folder
  const rootBomScript = resolve(packageRoot, '../../../../scripts/add-utf8-bom.mjs');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [rootBomScript, resolve(distRoot, 'docs')], { stdio: 'inherit' });
}

console.log('Prepared dist publish artifacts in:', distRoot);

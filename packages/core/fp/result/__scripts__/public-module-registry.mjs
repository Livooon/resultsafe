import { readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(scriptsRoot, '..');
export const registryPath = resolve(
  packageRoot,
  '..',
  '..',
  '..',
  '..',
  'platform',
  'staging',
  'resultsafe-core-v001',
  'PUBLIC-MODULE-REGISTRY.json',
);

const withoutExtension = (path) => path.replace(/\.ts$/, '');

export const loadPublicModuleRegistry = async () => {
  const document = JSON.parse(await readFile(registryPath, 'utf8'));
  const registry = document?.payload;
  if (!registry || !Array.isArray(registry.modules)) {
    throw new Error(`Invalid public module registry: ${registryPath}`);
  }
  if (registry.package_name !== '@resultsafe/core-fp-result') {
    throw new Error(`Registry package mismatch: ${registry.package_name}`);
  }
  if (registry.module_count !== registry.modules.length) {
    throw new Error(
      `Registry module_count is ${registry.module_count}, found ${registry.modules.length}`,
    );
  }

  const seen = new Set();
  for (const module of registry.modules) {
    if (!module.direct_export_required) {
      throw new Error(`Registry module is not a required direct export: ${module.direct_subpath}`);
    }
    if (seen.has(module.direct_subpath)) {
      throw new Error(`Duplicate registry subpath: ${module.direct_subpath}`);
    }
    seen.add(module.direct_subpath);
    if (!module.source_path.startsWith(`${registry.source_root}/`)) {
      throw new Error(`Module is outside registry source_root: ${module.source_path}`);
    }
    const expectedFormats = module.export_kind === 'TYPE_ONLY'
      ? ['TYPES']
      : ['ESM', 'CJS', 'TYPES'];
    if (JSON.stringify(module.formats) !== JSON.stringify(expectedFormats)) {
      throw new Error(`Unexpected formats for ${module.direct_subpath}`);
    }
  }
  return registry;
};

export const createPackageExports = (registry, { packed = false } = {}) => {
  const prefix = packed ? '.' : './dist';
  const rootRelative = withoutExtension(posix.relative(registry.source_root, registry.root_entry));
  const exports = {
    '.': {
      types: `${prefix}/types/${rootRelative}.d.ts`,
      import: `${prefix}/esm/${rootRelative}.js`,
      require: `${prefix}/cjs/${rootRelative}.js`,
    },
  };

  for (const module of registry.modules) {
    const relativePath = withoutExtension(
      posix.relative(registry.source_root, module.source_path),
    );
    exports[module.direct_subpath] = module.export_kind === 'TYPE_ONLY'
      ? { types: `${prefix}/types/${relativePath}.d.ts` }
      : {
          types: `${prefix}/types/${relativePath}.d.ts`,
          import: `${prefix}/esm/${relativePath}.js`,
          require: `${prefix}/cjs/${relativePath}.js`,
        };
  }
  return exports;
};

export const exportsEqual = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);

const mode = process.argv[2];
if (mode === '--write' || mode === '--check') {
  const packageJsonPath = resolve(packageRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const expected = createPackageExports(await loadPublicModuleRegistry());
  if (mode === '--write') {
    packageJson.exports = expected;
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    console.log(`Generated ${Object.keys(expected).length - 1} public subpath exports.`);
  } else if (!exportsEqual(packageJson.exports, expected)) {
    throw new Error('package.json exports are stale; run pnpm run generate:exports');
  } else {
    console.log(`Validated ${Object.keys(expected).length - 1} generated public subpath exports.`);
  }
}

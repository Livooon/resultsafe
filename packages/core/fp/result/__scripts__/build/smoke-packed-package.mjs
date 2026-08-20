import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPackageExports,
  exportsEqual,
  loadPublicModuleRegistry,
} from '../public-module-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');
const packageName = '@resultsafe/core-fp-result';
const pnpm = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm';

const run = (command, args, cwd) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });

const registry = await loadPublicModuleRegistry();
const runtimeSpecifiers = registry.modules
  .filter((module) => module.export_kind === 'RUNTIME')
  .map((module) => `${packageName}/${module.direct_subpath.slice(2)}`);
const typeOnlySpecifiers = registry.modules
  .filter((module) => module.export_kind === 'TYPE_ONLY')
  .map((module) => `${packageName}/${module.direct_subpath.slice(2)}`);
const allSpecifiers = registry.modules.map((module) => ({
  specifier: `${packageName}/${module.direct_subpath.slice(2)}`,
  exports: module.source_exports,
}));
const expectedExports = createPackageExports(registry, { packed: true });
const temporaryRoot = await mkdtemp(join(tmpdir(), 'resultsafe-result-smoke-'));

const sideEffectProbe = `
const calls = [];
const methods = ['log', 'info', 'warn', 'error', 'debug'];
const originals = Object.fromEntries(methods.map((method) => [method, console[method]]));
for (const method of methods) console[method] = (...args) => calls.push([method, args]);
const listeners = new Map(process.eventNames().map((event) => [event, process.listenerCount(event)]));
const assertNoEffects = () => {
  for (const method of methods) console[method] = originals[method];
  if (calls.length) throw new Error('Module import wrote to console');
  for (const event of process.eventNames()) {
    if (process.listenerCount(event) !== (listeners.get(event) ?? 0)) {
      throw new Error('Module import changed process listeners for ' + String(event));
    }
  }
};`;

try {
  // Pack exactly once; all subsequent checks use this installed tarball.
  await run(pnpm, ['pack', '--pack-destination', temporaryRoot, '--silent'], resolve(packageRoot, 'dist'));
  const tarballs = (await readdir(temporaryRoot)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`Expected one tarball, found ${tarballs.length}`);

  await writeFile(join(temporaryRoot, 'package.json'), '{"private":true}\n');
  await run(pnpm, ['add', join(temporaryRoot, tarballs[0]), '--ignore-scripts'], temporaryRoot);

  const installedRoot = join(temporaryRoot, 'node_modules', '@resultsafe', 'core-fp-result');
  const manifest = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
  if (!exportsEqual(manifest.exports, expectedExports)) {
    throw new Error('Packed manifest exports do not exactly match the registry');
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] && Object.keys(manifest[field]).length) {
      throw new Error(`Packed package has runtime ${field}`);
    }
  }
  for (const [subpath, conditions] of Object.entries(expectedExports)) {
    for (const target of Object.values(conditions)) {
      await access(resolve(installedRoot, target));
    }
    if (subpath !== '.' && !registry.modules.some((module) => module.direct_subpath === subpath)) {
      throw new Error(`Packed package exposes unregistered subpath ${subpath}`);
    }
  }

  await writeFile(
    join(temporaryRoot, 'esm.mjs'),
    `${sideEffectProbe}
const specs = ${JSON.stringify(runtimeSpecifiers)};
const root = await import('${packageName}');
for (const specifier of specs) await import(specifier);
for (const specifier of ${JSON.stringify(typeOnlySpecifiers)}) {
  try { await import(specifier); throw new Error('Type-only subpath resolved at runtime'); }
  catch (error) {
    if (error.message === 'Type-only subpath resolved at runtime') throw error;
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
  }
}
const okModule = await import('${packageName}/Ok');
const errModule = await import('${packageName}/Err');
assertNoEffects();
if (root.Ok(1).value !== 1 || root.Err('a').error !== 'a') throw new Error('Root exports failed');
if (okModule.Ok(2).value !== 2 || errModule.Err('b').error !== 'b') throw new Error('Direct Ok/Err compatibility failed');
try { await import('${packageName}/internal/resultValue'); throw new Error('Internal subpath resolved'); }
catch (error) { if (error.message === 'Internal subpath resolved') throw error; }
`,
  );
  await writeFile(
    join(temporaryRoot, 'cjs.cjs'),
    `${sideEffectProbe}
const specs = ${JSON.stringify(runtimeSpecifiers)};
const root = require('${packageName}');
for (const specifier of specs) require(specifier);
for (const specifier of ${JSON.stringify(typeOnlySpecifiers)}) {
  try { require(specifier); throw new Error('Type-only subpath resolved at runtime'); }
  catch (error) {
    if (error.message === 'Type-only subpath resolved at runtime') throw error;
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
  }
}
const okModule = require('${packageName}/Ok');
const errModule = require('${packageName}/Err');
assertNoEffects();
if (root.Ok(1).value !== 1 || root.Err('a').error !== 'a') throw new Error('Root exports failed');
if (okModule.Ok(2).value !== 2 || errModule.Err('b').error !== 'b') throw new Error('Direct Ok/Err compatibility failed');
try { require('${packageName}/internal/resultValue'); throw new Error('Internal subpath resolved'); }
catch (error) { if (error.message === 'Internal subpath resolved') throw error; }
`,
  );

  const typeImports = allSpecifiers.flatMap(({ specifier, exports }, moduleIndex) => [
    `import type * as Module${moduleIndex} from '${specifier}';`,
    `import type { ${exports.map((name, exportIndex) => `${name} as M${moduleIndex}_${exportIndex}`).join(', ')} } from '${specifier}';`,
  ]);
  typeImports.push(`import { Ok, Err, type Result } from '${packageName}';`);
  typeImports.push('const values: Result<number, string>[] = [Ok(1), Err(\'failure\')];');
  typeImports.push('void values;');
  await writeFile(join(temporaryRoot, 'types.ts'), `${typeImports.join('\n')}\n`);
  await writeFile(
    join(temporaryRoot, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      files: ['./types.ts'],
    }, null, 2)}\n`,
  );

  await run(process.execPath, [join(temporaryRoot, 'esm.mjs')], temporaryRoot);
  await run(process.execPath, [join(temporaryRoot, 'cjs.cjs')], temporaryRoot);
  await run(pnpm, ['exec', 'tsc', '--project', join(temporaryRoot, 'tsconfig.json')], packageRoot);
  console.log(
    `Packed package verified: ${runtimeSpecifiers.length} runtime and ${allSpecifiers.length} type subpaths.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

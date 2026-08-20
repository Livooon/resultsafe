import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;

const command = (name: string, args: readonly string[], cwd: string): Promise<string> => new Promise((done, reject) => {
  const child = spawn(name, args, { cwd, env: { ...process.env, NO_COLOR: '1' }, windowsHide: true, shell: process.platform === 'win32' && name.endsWith('.cmd') });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? done(stdout.trim()) : reject(new Error(`${name} exited ${String(code)}: ${(stderr || stdout).slice(-4000)}`)));
});

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const python = process.platform === 'win32' ? 'python.exe' : 'python3';

export const qualifyCoreModularity = async (coreTarball: string, registryPath: string, tscPath: string): Promise<Json> => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-core-modularity-'));
  try {
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    await command(npm, ['install', '--ignore-scripts', '--no-package-lock', coreTarball], workspace);
    const registryDocument = JSON.parse(await readFile(registryPath, 'utf8')) as Json;
    const registry = registryDocument['payload'] as Json;
    const modules = registry['modules'] as Json[];
    if (registry['package_name'] !== '@resultsafe/core-fp-result' || registry['module_count'] !== modules.length) throw new Error('Invalid PUBLIC-MODULE-REGISTRY package or module count.');
    const packageRoot = resolve(workspace, 'node_modules/@resultsafe/core-fp-result');
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as Json;
    const exportsMap = manifest['exports'] as Json;
    const expectedKeys = ['.', ...modules.map((item) => String(item['direct_subpath']))];
    if (JSON.stringify(Object.keys(exportsMap)) !== JSON.stringify(expectedKeys)) throw new Error('Packed export manifest is not the exact PUBLIC-MODULE-REGISTRY closure.');
    if (['dependencies', 'optionalDependencies', 'peerDependencies'].some((field) => Object.keys(manifest[field] as Json | undefined ?? {}).length !== 0)) throw new Error('Core package has runtime or peer dependencies.');
    if (manifest['sideEffects'] !== false) throw new Error('Core package does not declare sideEffects false.');
    const runtimeSpecifiers: string[] = ['@resultsafe/core-fp-result'];
    const typeSpecifiers: string[] = ['@resultsafe/core-fp-result'];
    for (const item of modules) {
      const subpath = String(item['direct_subpath']); const entry = exportsMap[subpath] as Json;
      const formats = item['formats'] as string[];
      const expectedConditions = formats.includes('ESM') ? ['types', 'import', 'require'] : ['types'];
      if (JSON.stringify(Object.keys(entry)) !== JSON.stringify(expectedConditions)) throw new Error(`Packed conditions differ for ${subpath}.`);
      for (const condition of expectedConditions) {
        const target = String(entry[condition]);
        if (!target.startsWith('./') || target.includes('/internal/') || target.includes('..')) throw new Error(`Unsafe or internal export target for ${subpath}.`);
        await readFile(resolve(packageRoot, target));
      }
      typeSpecifiers.push(`@resultsafe/core-fp-result${subpath.slice(1)}`);
      if (formats.includes('ESM')) runtimeSpecifiers.push(`@resultsafe/core-fp-result${subpath.slice(1)}`);
    }
    if (Object.keys(exportsMap).some((key) => /(^|\/)internal(\/|$)/.test(key))) throw new Error('Packed manifest exposes an internal subpath.');
    const probe = `import { createRequire } from 'node:module';\nconst require=createRequire(import.meta.url);\nconst specs=${JSON.stringify(runtimeSpecifiers)};\nconst before={globals:Reflect.ownKeys(globalThis).map(String).sort(),env:{...process.env},warnings:process.listenerCount('warning'),rejections:process.listenerCount('unhandledRejection')};\nconst root=await import(specs[0]),direct=new Set();\nfor(const spec of specs){const esm=await import(spec),cjs=require(spec),ek=Object.keys(esm).sort(),ck=Object.keys(cjs).sort();if(JSON.stringify(ek)!==JSON.stringify(ck))throw new Error('ESM/CJS parity: '+spec);if(spec!==specs[0])for(const name of ek){direct.add(name);if(!(name in root))throw new Error('root/subpath parity: '+spec+' '+name)}}\nif(JSON.stringify([...direct].sort())!==JSON.stringify(Object.keys(root).sort()))throw new Error('root has exports outside registered runtime subpaths');\nconst after={globals:Reflect.ownKeys(globalThis).map(String).sort(),env:{...process.env},warnings:process.listenerCount('warning'),rejections:process.listenerCount('unhandledRejection')};\nif(JSON.stringify(before)!==JSON.stringify(after))throw new Error('observable import side effect');\nconsole.log(JSON.stringify({runtime_subpaths:specs.length,root_exports:Object.keys(root).sort()}));`;
    await writeFile(resolve(workspace, 'probe.mjs'), probe);
    const runtime = JSON.parse(await command(process.execPath, [resolve(workspace, 'probe.mjs')], workspace)) as Json;
    const typeSource = typeSpecifiers.map((specifier, index) => `import type * as M${index} from ${JSON.stringify(specifier)}; type K${index}=keyof typeof M${index};`).join('\n');
    await writeFile(resolve(workspace, 'types.ts'), `${typeSource}\nexport {};\n`);
    await writeFile(resolve(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', skipLibCheck: false }, files: ['types.ts'] }));
    await command(tscPath, ['-p', resolve(workspace, 'tsconfig.json')], workspace);
    return { registry_document_sha256_input: registryPath, registry_modules: modules.length, packed_export_keys: expectedKeys.length, runtime, type_subpaths: typeSpecifiers.length, runtime_dependencies: 0, internal_exports: 0, observable_side_effects: 0 };
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

export const qualifyJsonCodec = async (coreTarball: string, codecTarball: string, wheel: string, vectorPath: string): Promise<Json> => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-json-codec-'));
  try {
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    await command(npm, ['install', '--ignore-scripts', '--no-package-lock', coreTarball, codecTarball], workspace);
    const vectors = JSON.parse(await readFile(vectorPath, 'utf8')) as Json;
    const probe = `import{decodeCause,decodeExit,encodeCause,encodeExit}from'@resultsafe/core-fp-codec-json';import{readFileSync}from'node:fs';const v=JSON.parse(readFileSync(process.argv[2],'utf8')),c={encode:x=>x,decode:x=>x};let valid=0,malformed=0;for(const x of v.valid){const y=x.kind==='cause'?encodeCause(decodeCause(x.wire,c),c):encodeExit(decodeExit(x.wire,c,c),c,c);if(JSON.stringify(y)!==JSON.stringify(x.wire))throw Error(x.name);valid++}for(const x of v.malformed){let rejected=false;try{x.kind==='cause'?decodeCause(x.wire,c):decodeExit(x.wire,c,c)}catch{rejected=true}if(!rejected)throw Error(x.name);malformed++}console.log(JSON.stringify({valid,malformed}));`;
    await writeFile(resolve(workspace, 'codec.mjs'), probe);
    const typescript = JSON.parse(await command(process.execPath, [resolve(workspace, 'codec.mjs'), vectorPath], workspace)) as Json;
    const target = resolve(workspace, 'python-target');
    await command(python, ['-m', 'pip', 'install', '--no-deps', '--target', target, wheel], workspace);
    const py = `import json,sys\nsys.path.insert(0,${JSON.stringify(target)})\nfrom resultsafe import decode_cause,decode_exit,encode_cause,encode_exit\nclass C:\n def encode(self,x): return x\n def decode(self,x): return x\nv=json.load(open(${JSON.stringify(vectorPath)},encoding='utf8')); c=C(); valid=malformed=0\nfor x in v['valid']:\n y=encode_cause(decode_cause(x['wire'],c),c) if x['kind']=='cause' else encode_exit(decode_exit(x['wire'],c,c),c,c)\n assert y==x['wire'],x['name']; valid+=1\nfor x in v['malformed']:\n try:\n  decode_cause(x['wire'],c) if x['kind']=='cause' else decode_exit(x['wire'],c,c)\n except (TypeError,ValueError,KeyError): malformed+=1\n else: raise AssertionError(x['name'])\nprint(json.dumps({'valid':valid,'malformed':malformed}))\n`;
    await writeFile(resolve(workspace, 'codec.py'), py);
    const pythonResult = JSON.parse(await command(python, ['-I', resolve(workspace, 'codec.py')], workspace)) as Json;
    if (JSON.stringify(typescript) !== JSON.stringify(pythonResult)) throw new Error('TypeScript and Python codec vector outcomes differ.');
    return { vector_counts: { valid: (vectors['valid'] as unknown[]).length, malformed: (vectors['malformed'] as unknown[]).length }, typescript, python: pythonResult };
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

export const qualifyEffectAdapter = async (coreTarball: string, adapterTarball: string): Promise<Json> => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-effect-adapter-'));
  try {
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    await command(npm, ['install', '--ignore-scripts', '--no-package-lock', coreTarball, adapterTarball, 'effect@3.22.1'], workspace);
    const coreManifest = JSON.parse(await readFile(resolve(workspace, 'node_modules/@resultsafe/core-fp-result/package.json'), 'utf8')) as Json;
    const coreDependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];
    if (coreDependencyFields.some((field) => Object.hasOwn(coreManifest[field] as Json | undefined ?? {}, 'effect'))) throw new Error('Core tarball has an Effect dependency.');
    const effectManifest = JSON.parse(await readFile(resolve(workspace, 'node_modules/effect/package.json'), 'utf8')) as Json;
    if (effectManifest['version'] !== '3.22.1') throw new Error('Installed Effect version is not exactly 3.22.1.');
    const probe = `import{CauseDie,CauseEmpty,CauseFail,CauseInterrupt,CauseParallel,CauseSequential,ExitFailure,ExitSuccess,Failure}from'@resultsafe/core-fp-result';import{effectCauseToResultSafe,resultSafeCauseToEffect,effectExitToResultSafe,resultSafeExitToEffect}from'@resultsafe/adapter-core-fp-effect';import*as C from'effect/Cause';import*as X from'effect/Exit';import*as F from'effect/FiberId';const df=Failure({schema_version:'1.0.0',code:'urn:test:defect'}),inf=Failure({schema_version:'1.0.0',code:'urn:test:interrupt'}),defect=new Error('boom'),fiber=F.runtime(7,1000);let d=0,i=0;const source=C.parallel(C.sequential(C.fail('left'),C.die(defect)),C.sequential(C.interrupt(fiber),C.empty));const rs=effectCauseToResultSafe(source,{defectToFailure:x=>{if(x!==defect)throw Error('defect identity');d++;return df},fiberIdToFailure:x=>{if(x!==fiber)throw Error('fiber identity');i++;return inf}});if(rs._tag!=='Parallel'||rs.left._tag!=='Sequential'||rs.left.left._tag!=='Fail'||rs.left.left.error!=='left'||rs.left.right._tag!=='Die'||rs.left.right.failure!==df||rs.right._tag!=='Sequential'||rs.right.left._tag!=='Interrupt'||rs.right.left.failure!==inf||rs.right.right._tag!=='Empty'||d!==1||i!==1)throw Error('Effect->ResultSafe Cause loss');const back=resultSafeCauseToEffect(CauseSequential(CauseParallel(CauseFail({code:1}),CauseDie(df)),CauseParallel(CauseInterrupt(inf),CauseEmpty())),{failureToDefect:f=>{if(f!==df)throw Error('failure defect identity');return defect},failureToFiberId:f=>{if(f!==inf)throw Error('failure fiber identity');return fiber}});if(back._tag!=='Sequential'||back.left._tag!=='Parallel'||back.left.left._tag!=='Fail'||back.left.left.error.code!==1||back.left.right._tag!=='Die'||back.left.right.defect!==defect||back.right._tag!=='Parallel'||back.right.left._tag!=='Interrupt'||back.right.left.fiberId!==fiber||back.right.right._tag!=='Empty')throw Error('ResultSafe->Effect Cause loss');const success=effectExitToResultSafe(X.succeed(42),{defectToFailure:()=>{throw Error('mapping called')},fiberIdToFailure:()=>{throw Error('mapping called')}});if(success._tag!=='Success'||success.value!==42||resultSafeExitToEffect(ExitSuccess(42),{failureToDefect:()=>{throw Error('mapping called')},failureToFiberId:()=>{throw Error('mapping called')}})._tag!=='Success')throw Error('success loss');const empty=resultSafeExitToEffect(ExitFailure(CauseEmpty()),{failureToDefect:()=>defect,failureToFiberId:()=>fiber});if(empty._tag!=='Failure'||empty.cause._tag!=='Empty'||effectExitToResultSafe(empty,{defectToFailure:()=>df,fiberIdToFailure:()=>inf}).cause._tag!=='Empty')throw Error('Failure(Empty) loss');const typed=effectExitToResultSafe(X.failCause(C.fail({code:7})),{defectToFailure:()=>df,fiberIdToFailure:()=>inf});if(typed._tag!=='Failure'||typed.cause._tag!=='Fail'||typed.cause.error.code!==7)throw Error('typed failure loss');console.log(JSON.stringify({cause_variants:6,cause_directions:2,exit_cases:3,mapping_identity:true,grouping_and_order:true,empty_failure_exact:true}));`;
    await writeFile(resolve(workspace, 'effect.mjs'), probe);
    return { effect_version: effectManifest['version'], core_effect_dependencies: 0, ...(JSON.parse(await command(process.execPath, [resolve(workspace, 'effect.mjs')], workspace)) as Json) };
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

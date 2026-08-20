import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalize } from 'json-canonicalize';

type Json = Record<string, unknown>;
type Target = 'typescript' | 'python';
type Variant = 'Empty' | 'Fail' | 'Die' | 'Interrupt' | 'Sequential' | 'Parallel' | 'Success' | 'Failure';

export interface CauseExitArtifact { kind: 'typescript-tarball' | 'python-wheel'; path: string; size?: number; sha256?: string }
export interface CauseExitRunOptions { stagingRoot?: string; runId?: string; outputPath?: string; writeCanonical?: boolean }
export interface CauseExitRunResult { matrix: Json; summary: string }

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const defaultStaging = resolve(repositoryRoot, 'platform/staging/resultsafe-core-v001');
const variants: readonly Variant[] = ['Empty', 'Fail', 'Die', 'Interrupt', 'Sequential', 'Parallel', 'Success', 'Failure'];
const modelFor = (variant: Variant): 'cause' | 'exit' => variant === 'Success' || variant === 'Failure' ? 'exit' : 'cause';
const scenarios: Readonly<Record<Variant, readonly string[]>> = {
  Empty: ['cause-empty-tag', 'cause-guard-unknown-tag'], Fail: ['cause-fail-error', 'cause-guard-unknown-field'],
  Die: ['cause-die-failure', 'cause-die-valid'], Interrupt: ['cause-interrupt-failure'],
  Sequential: ['cause-sequential-grouping', 'cause-sequential-order', 'cause-guard-cycle', 'cause-guard-depth-bound'],
  Parallel: ['cause-parallel-grouping', 'cause-parallel-order', 'cause-guard-node-bound'],
  Success: ['exit-success-identity', 'exit-guard-unknown-field', 'result-to-exit-success', 'exit-to-result-success'],
  Failure: ['exit-failure-empty', 'exit-guard-malformed', 'exit-guard-cause-bounds', 'result-to-exit-failure', 'exit-to-result-preserves-cause', 'exit-to-result-collapse'],
};
const expected: Readonly<Record<Variant, Json>> = {
  Empty: { exact_variant: true, malformed_tag_rejected: true },
  Fail: { payload_identity: true, malformed_fields_rejected: true },
  Die: { exact_variant: true, failure_identity: true },
  Interrupt: { exact_variant: true, failure_identity: true },
  Sequential: { binary_grouping: true, child_order: true, cycle_rejected: true, depth_limit_enforced: true },
  Parallel: { binary_grouping: true, child_order: true, node_limit_enforced: true },
  Success: { value_identity: true, malformed_fields_rejected: true, conversions_preserve_value: true },
  Failure: { empty_cause_valid: true, complete_cause_preserved: true, conversions_preserve_or_explicitly_collapse: true },
};

const uuidV7 = (): string => {
  const bytes = randomBytes(16); let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) { bytes[index] = timestamp & 0xff; timestamp = Math.floor(timestamp / 256); }
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f); bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const hex = bytes.toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const digestFile = async (path: string): Promise<{ size: number; sha256: string }> => { const bytes = await readFile(path); return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; };
const command = (name: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<string> => new Promise((done, reject) => {
  const child = spawn(name, args, { cwd, env: { ...env, NO_COLOR: '1' }, windowsHide: true, shell: process.platform === 'win32' && name.endsWith('.cmd') }); let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); }); child.once('error', reject);
  child.once('close', (code) => code === 0 ? done(stdout.trim()) : reject(new Error(`${name} exited ${String(code)}: ${(stderr || stdout).slice(-3000)}`)));
});
const readJson = async (root: string, name: string): Promise<Json> => JSON.parse(await readFile(resolve(root, name), 'utf8')) as Json;
const payload = (document: Json): Json => document['payload'] as Json;
const list = (value: unknown): Json[] => Array.isArray(value) ? value as Json[] : [];

const tsProbe = `import * as m from '@resultsafe/core-fp-result';
const f=m.Failure({schema_version:'1.0.0',code:'urn:resultsafe:probe'}), e=m.CauseEmpty(), a=m.CauseFail('a'), b=m.CauseFail('b'), seq=m.CauseSequential(m.CauseSequential(a,b),e), par=m.CauseParallel(a,m.CauseParallel(b,e));
const cyc={_tag:'Sequential'};cyc.left=cyc;cyc.right={_tag:'Empty'}; const ok={}; const sx=m.ExitSuccess(ok), fx=m.ExitFailure(e), fromOk=m.resultToExit(m.Ok(ok)), fromErr=m.resultToExit(m.Err(a.error)), causeResult=m.exitToResult(m.ExitFailure(par)); let seen; const collapsed=m.exitToResultCollapsed(m.ExitFailure(a),c=>{seen=c;return 'x'});
console.log(JSON.stringify({Empty:{exact_variant:e._tag==='Empty',malformed_tag_rejected:!m.isCause({_tag:'Other'})},Fail:{payload_identity:a.error==='a',malformed_fields_rejected:!m.isCause({_tag:'Fail',error:'a',extra:true})},Die:{exact_variant:m.CauseDie(f)._tag==='Die',failure_identity:m.CauseDie(f).failure===f},Interrupt:{exact_variant:m.CauseInterrupt(f)._tag==='Interrupt',failure_identity:m.CauseInterrupt(f).failure===f},Sequential:{binary_grouping:seq.left._tag==='Sequential',child_order:seq.left.left===a&&seq.left.right===b,cycle_rejected:!m.isCause(cyc),depth_limit_enforced:!m.isCause(seq,{max_depth:1,max_nodes:20})},Parallel:{binary_grouping:par.right._tag==='Parallel',child_order:par.left===a&&par.right.left===b,node_limit_enforced:!m.isCause(par,{max_depth:20,max_nodes:2})},Success:{value_identity:sx.value===ok,malformed_fields_rejected:!m.isExit({_tag:'Success',value:ok,extra:true}),conversions_preserve_value:fromOk.value===ok&&m.exitToResult(sx).value===ok},Failure:{empty_cause_valid:m.isExit(fx),complete_cause_preserved:causeResult.error===par,conversions_preserve_or_explicitly_collapse:fromErr.cause.error==='a'&&seen===a&&collapsed.error==='x'}}));`;
const tsTypes = `import { CauseFail, ExitFailure, isCause, isExit, exitToResult, type Cause, type Exit } from '@resultsafe/core-fp-result';
const c: unknown=CauseFail('e'); if(isCause(c,(x):x is string=>typeof x==='string')&&c._tag==='Fail'){const e:string=c.error;void e} const exact:Cause<string>=CauseFail('e');
const x:unknown=ExitFailure(exact);if(isExit(x,(v):v is number=>typeof v==='number',(e):e is string=>typeof e==='string')&&x._tag==='Failure'){const r=exitToResult(x);void r}const out:Exit<number,string>=x as Exit<number,string>;void out;`;
const pyProbe = `import json\nfrom resultsafe import *\nf=Failure('1.0.0','urn:resultsafe:probe'); e=Empty(); a=Fail('a'); b=Fail('b'); seq=Sequential(Sequential(a,b),e); par=Parallel(a,Parallel(b,e)); ok=object(); sx=ExitSuccess(ok); fx=ExitFailure(e); from_ok=result_to_exit(Ok(ok)); from_err=result_to_exit(Err(a.error)); cause_result=exit_to_cause_result(ExitFailure(par)); seen=[]; collapsed=exit_to_result(ExitFailure(a),lambda c:(seen.append(c) or 'x'))\ndef rejects(fn):\n try: fn(); return False\n except (TypeError,ValueError): return True\ndef malformed_fail(): Fail(error='a',extra=True)\ndef malformed_exit(): ExitSuccess(value=ok,extra=True)\ndef bad_cause(): ExitFailure(object())\ndef deep():\n v=Empty()\n for _ in range(34): v=Sequential(v,Empty())\ndef cyclic():\n c=object.__new__(Sequential); object.__setattr__(c,'left',c); object.__setattr__(c,'right',Empty()); ExitFailure(c)\ndef wide():\n v=Empty()\n for _ in range(10): v=Parallel(v,v)\n ExitFailure(v)\nout={'Empty':{'exact_variant':type(e) is Empty,'malformed_tag_rejected':rejects(bad_cause)},'Fail':{'payload_identity':a.error=='a','malformed_fields_rejected':rejects(malformed_fail)},'Die':{'exact_variant':type(Die(f)) is Die,'failure_identity':Die(f).failure is f},'Interrupt':{'exact_variant':type(Interrupt(f)) is Interrupt,'failure_identity':Interrupt(f).failure is f},'Sequential':{'binary_grouping':type(seq.left) is Sequential,'child_order':seq.left.left is a and seq.left.right is b,'cycle_rejected':rejects(cyclic),'depth_limit_enforced':rejects(deep)},'Parallel':{'binary_grouping':type(par.right) is Parallel,'child_order':par.left is a and par.right.left is b,'node_limit_enforced':rejects(wide)},'Success':{'value_identity':sx.value is ok,'malformed_fields_rejected':rejects(malformed_exit),'conversions_preserve_value':from_ok.value is ok and exit_to_cause_result(sx).value is ok},'Failure':{'empty_cause_valid':fx.cause is e,'complete_cause_preserved':cause_result.error is par,'conversions_preserve_or_explicitly_collapse':from_err.cause.error=='a' and seen[0] is a and collapsed.error=='x'}}\nprint(json.dumps(out))`;
const pyTypes = `from typing import assert_type\nfrom resultsafe import Cause, Err, Fail, Exit, ExitFailure, exit_to_cause_result\ncause: Cause[str] = Fail('e')\nexit: Exit[int, str] = ExitFailure(cause)\nif isinstance(exit, ExitFailure): assert_type(exit.cause, Cause[str])\nresult = exit_to_cause_result(exit)\nif isinstance(result, Err): assert_type(result.error, Cause[str])\n`;

const executeTarget = async (target: Target, artifactPath: string, workspace: string): Promise<{ outcomes: Json; type: 'PASS' | 'FAIL'; typeDetail: string }> => {
  await mkdir(workspace, { recursive: true });
  if (target === 'typescript') {
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    await command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--no-package-lock', artifactPath], workspace);
    await writeFile(resolve(workspace, 'probe.mjs'), tsProbe); const output = await command(process.execPath, [resolve(workspace, 'probe.mjs')], workspace);
    await writeFile(resolve(workspace, 'types.ts'), tsTypes); await writeFile(resolve(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', skipLibCheck: false }, files: ['types.ts'] }));
    let type: 'PASS' | 'FAIL' = 'PASS'; let typeDetail = 'Strict TypeScript narrowing probe compiled against the installed tarball declarations.';
    try { await command(resolve(repositoryRoot, 'tools/contract-registry/node_modules/.bin/tsc.cmd'), ['-p', resolve(workspace, 'tsconfig.json')], workspace); } catch (error) { type = 'FAIL'; typeDetail = error instanceof Error ? error.message.slice(-2000) : String(error); }
    return { outcomes: JSON.parse(output) as Json, type, typeDetail };
  }
  const targetPath = resolve(workspace, 'python-target');
  await command(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'pip', 'install', '--no-deps', '--target', targetPath, artifactPath], workspace);
  await writeFile(resolve(workspace, 'probe.py'), `import sys\nsys.path.insert(0, ${JSON.stringify(targetPath)})\n${pyProbe}`); const output = await command(process.platform === 'win32' ? 'python.exe' : 'python3', ['-I', resolve(workspace, 'probe.py')], workspace);
  await writeFile(resolve(workspace, 'typing_probe.py'), pyTypes); let type: 'PASS' | 'FAIL' = 'PASS'; let typeDetail = 'Strict mypy narrowing probe passed against the installed wheel.';
  try { await command(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'mypy', '--strict', resolve(workspace, 'typing_probe.py')], workspace, { ...process.env, MYPYPATH: targetPath }); } catch (error) { type = 'FAIL'; typeDetail = error instanceof Error ? error.message.slice(-2000) : String(error); }
  return { outcomes: JSON.parse(output) as Json, type, typeDetail };
};

export const runCauseExitQualification = async (artifacts: readonly CauseExitArtifact[], options: CauseExitRunOptions = {}): Promise<CauseExitRunResult> => {
  const staging = options.stagingRoot ?? defaultStaging; const runId = options.runId ?? uuidV7();
  const byKind = new Map(artifacts.map((artifact) => [artifact.kind, artifact])); const required = ['typescript-tarball', 'python-wheel'] as const;
  if (required.some((kind) => !byKind.has(kind))) throw new Error('Cause/Exit qualification requires one TypeScript tarball and one Python wheel.');
  const resolved = new Map<string, CauseExitArtifact>();
  for (const kind of required) { const item = byKind.get(kind)!; const path = resolve(item.path); const digest = await digestFile(path); if (item.sha256 && item.sha256 !== digest.sha256) throw new Error(`${kind} supplied digest differs from artifact bytes`); resolved.set(kind, { ...item, path, ...digest }); }
  const [cause, exit, projections, catalog, current] = await Promise.all([
    readJson(staging, 'CAUSE-MODEL.json'), readJson(staging, 'EXIT-MODEL.json'), readJson(staging, 'PROJECTION-CATALOG.json'),
    readJson(staging, 'SCENARIO-CATALOG.json'), readJson(staging, 'CAUSE-EXIT-CONFORMANCE-MATRIX.json'),
  ]);
  const projectionByTarget = new Map(list(payload(projections)['items']).map((item) => [String(item['target_key']), item]));
  const scenarioByKey = new Map(list(payload(catalog)['scenarios']).map((item) => [String(item['scenario_key']), String(item['scenario_ref'])]));
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-cause-exit-'));
  try {
    const results = new Map<Target, { outcomes: Json; type: 'PASS' | 'FAIL'; typeDetail: string }>();
    for (const [target, kind] of [['typescript', 'typescript-tarball'], ['python', 'python-wheel']] as const) results.set(target, await executeTarget(target, resolved.get(kind)!.path, resolve(workspace, target)));
    const cells = (['typescript', 'python'] as const).flatMap((target) => variants.map((variant) => {
      const actual = results.get(target)!.outcomes[variant] as Json; const runtime = canonicalize(actual) === canonicalize(expected[variant]) ? 'PASS' : 'FAIL'; const typeDisposition = results.get(target)!.type;
      const projection = projectionByTarget.get(target)!; const artifact = resolved.get(target === 'typescript' ? 'typescript-tarball' : 'python-wheel')!;
      return { cell_key: `${target}:${variant}`, target_key: target, model_key: modelFor(variant), variant, cause_model_revision: cause['document_revision'], exit_model_revision: exit['document_revision'], projection_catalog_revision: projections['document_revision'], projection_revision: projection['record_revision'], artifact: { kind: artifact.kind, sha256: artifact.sha256 }, run_id: runId, scenario_refs: scenarios[variant].map((key) => scenarioByKey.get(key)), expected_semantic_outcome: expected[variant], actual_semantic_outcome: actual, runtime_disposition: runtime, type_disposition: typeDisposition, type_evidence: results.get(target)!.typeDetail, status: runtime === 'PASS' && typeDisposition === 'PASS' ? 'PASS' : 'FAIL' };
    }));
    const passed = cells.filter((cell) => cell.status === 'PASS').length; const status = passed === cells.length ? 'PASS' : 'FAIL';
    const now = new Date(Math.max(Date.now(), Date.parse(String(current['created_at'])), Date.parse(String(current['updated_at'])) + 1)).toISOString();
    const matrix: Json = { ...current, document_revision: Number(current['document_revision']) + 1, updated_at: now, summary: `Executable Cause/Exit evidence for exact installed TypeScript and Python artifacts; aggregate ${status} is derived from ${passed}/${cells.length} cells.`, payload: { matrix_version: '2.0.0', cause_model_ref: cause['document_ref'], cause_model_revision: cause['document_revision'], exit_model_ref: exit['document_ref'], exit_model_revision: exit['document_revision'], projection_catalog_ref: projections['document_ref'], projection_catalog_revision: projections['document_revision'], run_id: runId, cells, aggregate: { total: cells.length, passed, failed: cells.length - passed, status } } };
    const output = options.writeCanonical ? resolve(staging, 'CAUSE-EXIT-CONFORMANCE-MATRIX.json') : options.outputPath;
    if (output) await writeFile(output, `${JSON.stringify(matrix, null, 2)}\n`);
    return { matrix, summary: `${passed}/${cells.length} Cause/Exit cells ${status} for exact tarball ${resolved.get('typescript-tarball')!.sha256} and wheel ${resolved.get('python-wheel')!.sha256}.` };
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

const argument = (name: string): string | undefined => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tarball = argument('--tarball'); const wheel = argument('--wheel'); if (!tarball || !wheel) throw new Error('Usage: cause-exit-qualification --tarball <tgz> --wheel <whl> [--output <json> | --write-canonical]');
  const outputPath = argument('--output');
  const result = await runCauseExitQualification([{ kind: 'typescript-tarball', path: tarball }, { kind: 'python-wheel', path: wheel }], { ...(outputPath ? { outputPath } : {}), writeCanonical: process.argv.includes('--write-canonical') }); console.log(result.summary);
}

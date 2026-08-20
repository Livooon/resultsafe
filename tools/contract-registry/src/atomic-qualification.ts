import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalize } from 'json-canonicalize';
import { logicalDump, qualifyProjection } from '../../sqlite-projection/src/compiler.js';
import { runConformance } from './conformance.js';
import { runCauseExitQualification } from './cause-exit-qualification.js';
import { qualifyCoreModularity, qualifyEffectAdapter, qualifyJsonCodec } from './artifact-gates.js';
import { checkIntegrityManifest } from './integrity.js';
import { loadCorpus } from './load.js';
import { sourceHygienePolicyErrors, validateCorpus } from './validate.js';

type Json = Record<string, unknown>;
type ArtifactKind = 'core-tarball' | 'python-wheel' | 'codec-tarball' | 'effect-adapter-tarball';
type ChildKind = 'structural' | 'canonical-scenario' | 'cross-language-matrix' | 'core-modularity' | 'cause-exit-exact-artifacts' | 'json-codec' | 'effect-adapter' | 'python-wheel' | 'storage' | 'integrity';
type EvidenceKind = ChildKind | 'storage-base-dump' | 'storage-structured-failure-dump' | 'storage-cause-exit-dump' | 'governed-checks';
type RunStatus = 'STAGED' | 'PASS' | 'FAIL';

interface InventoryFile { path: string; size: number; sha256: string }
interface Artifact { kind: ArtifactKind; path: string; size: number; sha256: string }
interface EvidenceArtifact { kind: EvidenceKind; path: string; size: number; sha256: string; artifact_sha256: Record<string, string> }
interface ChildResult { kind: ChildKind; run_id: string; parent_run_id: string; status: 'NOT_EXECUTED' | 'PASS' | 'FAIL'; evidence: string; evidence_artifact: EvidenceArtifact | null }
interface TreeEvidence { algorithm: 'SHA-256'; canonicalization: 'RFC8785'; root: string; exclusions: string[]; inventory: InventoryFile[]; digest: string }

interface SourceHygienePolicy {
  governed_roots: string[];
  forbidden_colocated_generated_suffixes: string[];
  ignored_local_only_paths: string[];
  required_gitignore_rules: { owning_file: string; rule: string }[];
  source_snapshot_rule: { forbidden_generated_outputs: string; local_only_paths: string };
  enforcement: string;
  qualification_gate: string;
  evidence_owner: string;
}

export interface SourceHygieneInputs {
  policy: SourceHygienePolicy;
  inventory_paths: readonly string[];
  intended_source_snapshot_paths: readonly string[];
  tracked_paths: readonly string[];
  gitignore_files: Readonly<Record<string, string>>;
}

export interface SourceHygieneValidation {
  errors: string[];
  details: Json;
}

export interface AtomicValidationContext {
  root?: string;
  canonicalRoot?: string;
  governedReceiptPath?: string;
  sourcePaths?: readonly string[];
}

export interface AtomicQualification {
  schema_version: '1.0.0';
  run_manifest: Json;
  run_receipt: Json;
}

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const staging = resolve(root, 'platform/staging/resultsafe-core-v001');
const candidatesRoot = resolve(root, '.resultsafe-candidates');
const resultPackage = resolve(root, 'packages/core/fp/result');
const codecPackage = resolve(root, 'packages/adapter/core/fp/codec/json');
const effectPackage = resolve(root, 'packages/adapter/core/fp/effect');
const codecVectors = resolve(codecPackage, 'vectors/codec.json');
const publicModuleRegistry = resolve(staging, 'PUBLIC-MODULE-REGISTRY.json');
const adapters = resolve(root, 'tools/contract-registry/src/adapters');
const childKinds: readonly ChildKind[] = ['structural', 'canonical-scenario', 'cross-language-matrix', 'core-modularity', 'cause-exit-exact-artifacts', 'json-codec', 'effect-adapter', 'python-wheel', 'storage', 'integrity'];
const artifactKinds: readonly ArtifactKind[] = ['core-tarball', 'python-wheel', 'codec-tarball', 'effect-adapter-tarball'];
export const canonicalInputExclusions = ['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json', 'WAVE-PLAN.json'] as const;
// The governed receipt contains this digest, so excluding it avoids an impossible self-hash cycle.
export const finalCanonicalTreeExclusions = ['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json'] as const;
const digestPattern = /^[0-9a-f]{64}$/;
const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const uuidV7 = (): string => {
  const bytes = randomBytes(16);
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) { bytes[index] = timestamp & 0xff; timestamp = Math.floor(timestamp / 256); }
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const fileDigest = async (path: string): Promise<{ size: number; sha256: string }> => {
  const bytes = await readFile(path);
  return { size: bytes.length, sha256: sha256(bytes) };
};
const normalized = (path: string): string => relative(root, path).split(sep).join('/');
const records = (value: unknown): Json[] => Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
const normalizedInventoryPath = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//, '');

const run = (command: string, args: readonly string[], cwd = root, env: NodeJS.ProcessEnv = process.env, echoOutput = true): Promise<string> =>
  new Promise((done, reject) => {
    console.log(`+ ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd, env: { ...env, NO_COLOR: '1' }, shell: process.platform === 'win32' && command.endsWith('.cmd'), windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); if (echoOutput) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? done(stdout.trim()) : reject(new Error(`${command} exited ${String(code)}: ${(stderr || stdout).trim().slice(-2000)}`)));
  });

const git = async (args: readonly string[]): Promise<string> => run('git', args, root, process.env, false).then((value) => value.trim());

export const validateSourceHygiene = (inputs: SourceHygieneInputs): SourceHygieneValidation => {
  const errors = sourceHygienePolicyErrors(inputs.policy);
  const policy = inputs.policy;
  const inventory = inputs.inventory_paths.map(normalizedInventoryPath);
  const snapshot = inputs.intended_source_snapshot_paths.map(normalizedInventoryPath);
  const tracked = inputs.tracked_paths.map(normalizedInventoryPath);
  const underGovernedRoot = (path: string): boolean => policy.governed_roots.some((governedRoot) => path.startsWith(`${governedRoot}/`));
  const forbiddenGenerated = (path: string): boolean => underGovernedRoot(path) && policy.forbidden_colocated_generated_suffixes.some((suffix) => path.endsWith(suffix));
  const localOnly = (path: string): boolean => policy.ignored_local_only_paths.some((prefix) => path.startsWith(prefix));
  const inventoryGenerated = inventory.filter(forbiddenGenerated).sort();
  const inventoryLocalOnly = inventory.filter(localOnly).sort();
  const snapshotGenerated = snapshot.filter(forbiddenGenerated).sort();
  const snapshotLocalOnly = snapshot.filter(localOnly).sort();
  const trackedGenerated = tracked.filter(forbiddenGenerated).sort();
  const requiredRules = policy.required_gitignore_rules.map(({ owning_file, rule }) => {
    const contents = inputs.gitignore_files[owning_file];
    const occurrences = typeof contents === 'string' ? contents.split(/\r?\n/).filter((line) => line === rule).length : 0;
    if (occurrences !== 1) errors.push(`${owning_file}: required ignore rule ${JSON.stringify(rule)} occurs ${occurrences} times, expected exactly once`);
    return { owning_file, rule, occurrences };
  });
  if (inventoryGenerated.length) errors.push(`complete Git inventory contains forbidden colocated generated outputs: ${inventoryGenerated.join(', ')}`);
  if (inventoryLocalOnly.length) errors.push(`complete Git inventory admits local-only paths: ${inventoryLocalOnly.join(', ')}`);
  if (snapshotGenerated.length) errors.push(`intended source snapshot contains forbidden colocated generated outputs: ${snapshotGenerated.join(', ')}`);
  if (snapshotLocalOnly.length) errors.push(`intended source snapshot contains local-only paths: ${snapshotLocalOnly.join(', ')}`);
  if (trackedGenerated.length) errors.push(`git cached inventory contains forbidden colocated generated outputs: ${trackedGenerated.join(', ')}`);
  return {
    errors,
    details: {
      enforcement: policy.enforcement,
      qualification_gate: policy.qualification_gate,
      evidence_owner: policy.evidence_owner,
      roots: [...policy.governed_roots],
      patterns: {
        forbidden_colocated_generated_suffixes: [...policy.forbidden_colocated_generated_suffixes],
        ignored_local_only_paths: [...policy.ignored_local_only_paths],
      },
      required_rules: requiredRules,
      counts: {
        complete_inventory: inventory.length,
        intended_source_snapshot: snapshot.length,
        tracked: tracked.length,
        inventory_forbidden_generated: inventoryGenerated.length,
        inventory_local_only: inventoryLocalOnly.length,
        snapshot_forbidden_generated: snapshotGenerated.length,
        snapshot_local_only: snapshotLocalOnly.length,
        tracked_forbidden_generated: trackedGenerated.length,
        required_gitignore_rules: requiredRules.length,
        valid_required_gitignore_rules: requiredRules.filter((item) => item.occurrences === 1).length,
      },
    },
  };
};

const intendedSource = (path: string): boolean => {
  const included = [
    '.github/workflows/', 'docs/', 'packages/core/fp/result/', 'packages/core/fp/result-shared/', 'packages/core/fp/option/', 'packages/adapter/', 'packages/python/',
    'platform/staging/resultsafe-core-v001/', 'requirements/', 'tools/contract-registry/', 'tools/release/', 'tools/sqlite-projection/',
  ].some((prefix) => path.startsWith(prefix)) || [
    'tools/qualify_python.py', 'package.json', 'pnpm-lock.yaml', 'packages/pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'pyproject.toml', 'tsconfig.json', 'tsconfig.base.json', 'tsconfig.base.strict.json', 'tsconfig.aliases.json', 'vitest.config.ts',
    'CANON.md', 'AI_DOC_FRAMEWORK.md',
  ].includes(path);
  return included && !/(^|\/)(node_modules|dist|build|coverage|__pycache__|\.pytest_cache|\.mypy_cache|\.cache|\.tmp[^/]*|notes)(\/|$)/.test(path)
    && !/\.(pyc|tsbuildinfo)$/.test(path) && !/\.egg-info\//.test(path);
};

const inventoryDigest = (inventory: readonly InventoryFile[]): string =>
  sha256(inventory.map((item) => `${item.path}\0${item.sha256}\0${item.size}`).join('\n'));

const inventoryFiles = async (base: string, paths: readonly string[]): Promise<InventoryFile[]> => Promise.all([...paths].sort().map(async (path) => {
  const digest = await fileDigest(resolve(base, path));
  return { path: path.replaceAll('\\', '/'), ...digest };
}));

export const sourceSnapshot = async (base = root, suppliedPaths?: readonly string[]): Promise<{ inventory: InventoryFile[]; digest: string }> => {
  const discovered = suppliedPaths ?? (await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(intendedSource);
  const paths = [];
  for (const path of [...discovered].sort()) {
    try { await stat(resolve(base, path)); paths.push(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const inventory = await inventoryFiles(base, paths);
  return { inventory, digest: inventoryDigest(inventory) };
};

const aggregateDigest = (inventory: readonly InventoryFile[], predicate: (path: string) => boolean): string =>
  sha256(inventory.filter((item) => predicate(item.path)).map((item) => `${item.path}\0${item.sha256}\0${item.size}`).join('\n'));

const walkJson = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkJson(path) : entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }))).flat().sort();
};

export const canonicalTreeEvidence = async (canonicalRoot: string, exclusions: readonly string[]): Promise<TreeEvidence> => {
  const excluded = new Set(exclusions);
  const paths = (await walkJson(canonicalRoot)).filter((path) => !excluded.has(relative(canonicalRoot, path).split(sep).join('/')));
  const inventory = await Promise.all(paths.map(async (path): Promise<InventoryFile> => {
    const canonical = canonicalize(JSON.parse(await readFile(path, 'utf8')) as unknown);
    return { path: relative(canonicalRoot, path).split(sep).join('/'), sha256: sha256(canonical), size: Buffer.byteLength(canonical) };
  }));
  return { algorithm: 'SHA-256', canonicalization: 'RFC8785', root: normalized(canonicalRoot), exclusions: [...exclusions], inventory, digest: inventoryDigest(inventory) };
};

const commandVersion = async (command: string, args: readonly string[]): Promise<string> => (await run(command, args)).split(/\r?\n/)[0] ?? '';

const packNpm = async (packagePath: string, candidate: string): Promise<string> => {
  const output = JSON.parse(await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', packagePath, '--json', '--pack-destination', candidate], root, process.env, false)) as Json[];
  const filename = String(output[0]?.['filename'] ?? '');
  if (!filename.endsWith('.tgz')) throw new Error(`npm pack did not report a tarball for ${packagePath}`);
  return resolve(candidate, filename);
};

const buildArtifacts = async (candidate: string): Promise<Artifact[]> => {
  await run(process.platform === 'win32' ? 'pnpm.exe' : 'pnpm', ['-C', 'packages/core/fp/result', 'run', 'build:release']);
  const coreTarball = await packNpm(resolve(resultPackage, 'dist'), candidate);
  await run(process.platform === 'win32' ? 'pnpm.exe' : 'pnpm', ['-C', 'packages/adapter/core/fp/codec/json', 'run', 'build']);
  const codecTarball = await packNpm(codecPackage, candidate);
  await run(process.platform === 'win32' ? 'pnpm.exe' : 'pnpm', ['-C', 'packages/adapter/core/fp/effect', 'run', 'build']);
  const effectTarball = await packNpm(effectPackage, candidate);
  await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'build', '--wheel', '--outdir', candidate]);
  const names = await readdir(candidate);
  const wheel = names.find((name) => name.endsWith('.whl'));
  if (!wheel) throw new Error('The isolated build did not produce the required Python wheel.');
  const outputs: readonly [Artifact['kind'], string][] = [
    ['core-tarball', coreTarball], ['python-wheel', resolve(candidate, wheel)], ['codec-tarball', codecTarball], ['effect-adapter-tarball', effectTarball],
  ];
  return Promise.all(outputs.map(async ([kind, path]): Promise<Artifact> => ({ kind, path: normalized(path), ...await fileDigest(path) })));
};

const qualifyPythonArtifact = async (wheel: string): Promise<string> => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-py-artifact-'));
  try {
    const target = resolve(workspace, 'target');
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'pip', 'install', '--no-deps', '--target', target, wheel]);
    const probePath = resolve(workspace, 'probe.py');
    await writeFile(probePath, `import sys\nsys.path.insert(0, ${JSON.stringify(target)})\nimport resultsafe\nassert resultsafe.Ok(7).unwrap() == 7\n`);
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-I', probePath], workspace);
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'pytest', 'packages/python/tests']);
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'mypy', '--strict', 'packages/python/src', 'packages/python/typing/positive.py']);
    return 'Exact wheel installed with no dependencies; isolated runtime smoke, Python tests, and strict typing passed without rebuilding.';
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

const qualifyMatrix = async (tarball: Artifact, wheel: Artifact): Promise<{ summary: string; details: Json }> => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-atomic-matrix-'));
  try {
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n');
    const tarballPath = resolve(root, tarball.path); const wheelPath = resolve(root, wheel.path);
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--no-package-lock', tarballPath], workspace);
    const pythonTarget = resolve(workspace, 'python-target');
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'pip', 'install', '--no-deps', '--target', pythonTarget, wheelPath]);
    const matrix = JSON.parse(await readFile(resolve(staging, 'CONFORMANCE-MATRIX.json'), 'utf8')) as Json;
    const cells = records((matrix['payload'] as Json)['cells']);
    const executionCells: Json[] = cells.map((cell): Json => ({ ...cell, expected_outcome: { ...(cell['expected_outcome'] as Json), positive_types: 'NOT_ASSESSED_OPERATION_SPECIFIC', negative_types: 'NOT_ASSESSED_OPERATION_SPECIFIC' } }));
    const tsCells = executionCells.filter((cell) => cell['target_language'] === 'typescript');
    const pyCells = executionCells.filter((cell) => cell['target_language'] === 'python');
    const tsPath = resolve(workspace, 'typescript-cells.json'); const pyPath = resolve(workspace, 'python-cells.json');
    await Promise.all([writeFile(tsPath, JSON.stringify(tsCells)), writeFile(pyPath, JSON.stringify(pyCells))]);
    const tsOutput = await run(process.execPath, [resolve(adapters, 'typescript.mjs'), resolve(workspace, 'node_modules/@resultsafe/core-fp-result'), tsPath], workspace);
    const pyOutput = await run(process.platform === 'win32' ? 'python.exe' : 'python3', [resolve(adapters, 'python.py'), pythonTarget, pyPath], workspace);
    const outcomes = new Map([...JSON.parse(tsOutput) as Json[], ...JSON.parse(pyOutput) as Json[]].map((item) => [item['cell_key'], item['outcome']]));
    if (executionCells.length !== 88 || executionCells.some((cell) => JSON.stringify(outcomes.get(cell['cell_key'])) !== JSON.stringify(cell['expected_outcome']))) throw new Error('Exact-artifact matrix outcome differs from one or more of 88 run-specific cells.');
    const details: Json = {
      schema_version: '1.0.0', status: 'PASS', matrix_document_ref: matrix['document_ref'], matrix_document_revision: matrix['document_revision'],
      artifacts: [tarball, wheel].map(({ kind, size, sha256: digest }) => ({ kind, size, sha256: digest })),
      type_evidence_scope: 'PACKAGE_LEVEL_SMOKE_ONLY_NOT_PER_CELL', counts: { cells: cells.length, passed: cells.length, failed: 0 },
      outcomes: [...outcomes].sort(([left], [right]) => String(left).localeCompare(String(right))).map(([cell_key, outcome]) => ({ cell_key, outcome })),
    };
    return { summary: '88/88 canonical cross-language runtime cells matched against the exact core tarball and wheel; per-cell type claims are explicitly unassessed.', details };
  } finally { await rm(workspace, { recursive: true, force: true }); }
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sameJson = (left: unknown, right: unknown): boolean => canonicalize(left) === canonicalize(right);

const validateAtomicBindings = (qualification: AtomicQualification): string[] => {
  const errors: string[] = [];
  const manifest = qualification.run_manifest;
  const receipt = qualification.run_receipt;
  const parent = String(manifest['parent_run_id']);
  if (qualification.schema_version !== '1.0.0') errors.push('schema version');
  if (!uuidV7Pattern.test(parent) || receipt['parent_run_id'] !== parent) errors.push('parent run binding');
  const source = manifest['source_snapshot'] as Json;
  if (!digestPattern.test(String(source?.['digest'])) || receipt['qualified_source_snapshot_sha256'] !== source?.['digest']) errors.push('source snapshot digest binding');
  const artifacts = records(manifest['artifacts']);
  if (artifacts.length !== artifactKinds.length || artifactKinds.some((kind) => artifacts.filter((item) => item['kind'] === kind).length !== 1)) errors.push('artifact kind closure');
  const qualifiedArtifacts = records(receipt['qualified_artifacts']);
  const publication = manifest['publication_inputs'] as Json;
  for (const artifact of artifacts) {
    const kind = String(artifact['kind']); const digest = String(artifact['sha256']);
    if (!digestPattern.test(digest) || qualifiedArtifacts.find((item) => item['kind'] === kind)?.['sha256'] !== digest || publication?.[`${kind}_sha256`] !== digest) errors.push(`${kind} digest binding`);
  }
  const declared = manifest['child_run_ids'] as Json;
  const children = records(receipt['children']);
  if (children.length !== childKinds.length || new Set(children.map((child) => child['run_id'])).size !== childKinds.length) errors.push('child run cardinality');
  for (const kind of childKinds) {
    const child = children.find((item) => item['kind'] === kind);
    if (!child || child['parent_run_id'] !== parent || child['run_id'] !== declared?.[kind] || !uuidV7Pattern.test(String(child['run_id']))) errors.push(`${kind} child run binding`);
    const evidence = child?.['evidence_artifact'] as Json | null | undefined;
    if (child?.['status'] === 'PASS' && (!evidence || evidence['kind'] !== kind)) errors.push(`${kind} evidence kind binding`);
    if (evidence) for (const artifact of artifacts) if ((evidence['artifact_sha256'] as Json)?.[String(artifact['kind'])] !== artifact['sha256']) errors.push(`${kind} ${String(artifact['kind'])} evidence binding`);
  }
  const status = receipt['status'] as RunStatus;
  const governedRequirement = manifest['governed_requirement'] as Json;
  if (governedRequirement?.['required_status'] === 'PASS' && status !== 'PASS') errors.push('governed PASS requirement');
  if (status === 'PASS' && children.some((child) => child['status'] !== 'PASS')) errors.push('aggregate PASS without all child gates');
  const promotion = receipt['promotion'] as Json;
  const clean = (manifest['git'] as Json)?.['worktree_clean'] === true;
  if (promotion?.['eligible'] !== clean || (clean ? promotion?.['blocker'] !== null : promotion?.['blocker'] !== 'DIRTY_OR_UNCOMMITTED_SOURCE')) errors.push('promotion cleanliness binding');
  const inputTree = manifest['canonical_input_tree'] as Json;
  if (!inputTree || !sameJson(inputTree['exclusions'], canonicalInputExclusions) || !digestPattern.test(String(inputTree['digest']))) errors.push('canonical input tree scope');
  const finalTree = receipt['final_canonical_tree'] as Json;
  if (!finalTree || !sameJson(finalTree['exclusions'], finalCanonicalTreeExclusions) || !digestPattern.test(String(finalTree['digest']))) errors.push('final canonical tree scope');
  const matrixInputs = manifest['matrix_inputs'] as Json;
  for (const artifact of artifacts) if (matrixInputs?.[`${String(artifact['kind'])}_sha256`] !== artifact['sha256']) errors.push(`${String(artifact['kind'])} matrix binding`);
  const dumps = records(receipt['logical_dumps']);
  const dumpKinds: readonly EvidenceKind[] = ['storage-base-dump', 'storage-structured-failure-dump', 'storage-cause-exit-dump'];
  if (dumps.length !== dumpKinds.length || dumpKinds.some((kind) => dumps.filter((item) => item['kind'] === kind).length !== 1)) errors.push('logical dump kind closure');
  const receiptEvidence = [...dumps, ...(typeof receipt['governed_check_evidence'] === 'object' && receipt['governed_check_evidence'] !== null ? [receipt['governed_check_evidence'] as Json] : [])];
  for (const evidence of receiptEvidence) for (const artifact of artifacts) if ((evidence['artifact_sha256'] as Json)?.[String(artifact['kind'])] !== artifact['sha256']) errors.push(`${String(evidence['kind'])} ${String(artifact['kind'])} evidence binding`);
  return [...new Set(errors)];
};

export const validateAtomicQualification = async (qualification: AtomicQualification, context: AtomicValidationContext = {}): Promise<string[]> => {
  const errors = validateAtomicBindings(qualification);
  const validationRoot = context.root ?? root;
  const canonicalRoot = context.canonicalRoot ?? staging;
  const manifest = qualification.run_manifest; const receipt = qualification.run_receipt;
  try {
    const declaredSource = manifest['source_snapshot'] as Json;
    const declaredInventory = records(declaredSource?.['inventory']) as unknown as InventoryFile[];
    const actualSource = await sourceSnapshot(validationRoot, context.sourcePaths);
    if (!sameJson(actualSource.inventory, declaredInventory) || actualSource.digest !== declaredSource?.['digest']) errors.push('source snapshot bytes or inventory');
  } catch { errors.push('source snapshot unavailable'); }
  for (const artifact of records(manifest['artifacts'])) {
    try {
      const actual = await fileDigest(resolve(validationRoot, String(artifact['path'])));
      if (actual.size !== artifact['size'] || actual.sha256 !== artifact['sha256']) errors.push(`${String(artifact['kind'])} artifact bytes`);
    } catch { errors.push(`${String(artifact['kind'])} artifact unavailable`); }
  }
  try {
    const actualInput = await canonicalTreeEvidence(canonicalRoot, canonicalInputExclusions);
    if (!sameJson(actualInput, manifest['canonical_input_tree'])) errors.push('canonical input tree bytes or inventory');
  } catch { errors.push('canonical input tree unavailable'); }
  try {
    const actualFinal = await canonicalTreeEvidence(canonicalRoot, finalCanonicalTreeExclusions);
    if (!sameJson(actualFinal, receipt['final_canonical_tree'])) errors.push('final canonical tree bytes or inventory');
  } catch { errors.push('final canonical tree unavailable'); }
  const externalEvidence = [
    ...records(receipt['children']).map((child) => child['evidence_artifact']).filter((item): item is Json => typeof item === 'object' && item !== null),
    ...records(receipt['logical_dumps']),
    ...(typeof receipt['governed_check_evidence'] === 'object' && receipt['governed_check_evidence'] !== null ? [receipt['governed_check_evidence'] as Json] : []),
  ];
  for (const evidence of externalEvidence) {
    try {
      const actual = await fileDigest(resolve(validationRoot, String(evidence['path'])));
      if (actual.size !== evidence['size'] || actual.sha256 !== evidence['sha256']) errors.push(`${String(evidence['kind'])} evidence bytes`);
    } catch { errors.push(`${String(evidence['kind'])} evidence unavailable`); }
  }
  const governedPath = context.governedReceiptPath ?? resolve(canonicalRoot, 'QUALIFICATION-RECEIPT.json');
  try {
    const governed = JSON.parse(await readFile(governedPath, 'utf8')) as Json; const payload = governed['payload'] as Json;
    if (payload?.['structural_status'] === 'PASS' && payload?.['behavioral_status'] === 'PASS' && receipt['status'] !== 'PASS') errors.push('governed receipt requires PASS');
  } catch { errors.push('governed receipt unavailable'); }
  return [...new Set(errors)];
};

const mutationSelfCheck = async (qualification: AtomicQualification, context: AtomicValidationContext): Promise<void> => {
  const mutations: [string, (value: AtomicQualification) => void][] = [
    ['source', (value) => { (value.run_manifest['source_snapshot'] as Json)['digest'] = '0'.repeat(64); }],
    ['artifact', (value) => { records(value.run_manifest['artifacts'])[0]!['sha256'] = '0'.repeat(64); }],
    ['child', (value) => { records(value.run_receipt['children'])[0]!['run_id'] = uuidV7(); }],
  ];
  for (const [name, mutate] of mutations) { const changed = clone(qualification); mutate(changed); if ((await validateAtomicQualification(changed, context)).length === 0) throw new Error(`${name} mutation was not rejected`); }
};

export const runAtomicQualification = async (): Promise<AtomicQualification> => {
  await mkdir(candidatesRoot, { recursive: true });
  const parentRunId = uuidV7();
  const candidate = resolve(candidatesRoot, parentRunId);
  await mkdir(candidate);
  const children: ChildResult[] = childKinds.map((kind) => ({ kind, run_id: uuidV7(), parent_run_id: parentRunId, status: 'NOT_EXECUTED', evidence: 'Not executed because the atomic run has not reached this gate.', evidence_artifact: null }));
  const policyDocument = JSON.parse(await readFile(resolve(staging, 'CORE-MODULARITY-POLICY.json'), 'utf8')) as Json;
  const sourceHygieneValue = (policyDocument['payload'] as Json)?.['source_hygiene'];
  const policyErrors = sourceHygienePolicyErrors(sourceHygieneValue);
  if (policyErrors.length) throw new Error(`Canonical source hygiene policy validation failed: ${policyErrors.join('; ')}`);
  const sourceHygienePolicy = sourceHygieneValue as SourceHygienePolicy;
  const completeInventoryPaths = (await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  const intendedSourcePaths = completeInventoryPaths.filter(intendedSource);
  const trackedPaths = (await git(['ls-files', '--cached', '-z'])).split('\0').filter(Boolean);
  const owningFiles = [...new Set(sourceHygienePolicy.required_gitignore_rules.map((item) => item.owning_file))];
  const gitignoreFiles = Object.fromEntries(await Promise.all(owningFiles.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')] as const)));
  const sourceHygiene = validateSourceHygiene({ policy: sourceHygienePolicy, inventory_paths: completeInventoryPaths, intended_source_snapshot_paths: intendedSourcePaths, tracked_paths: trackedPaths, gitignore_files: gitignoreFiles });
  if (sourceHygiene.errors.length) throw new Error(`Source hygiene validation failed: ${sourceHygiene.errors.join('; ')}`);
  const snapshot = await sourceSnapshot(root, intendedSourcePaths);
  const gitState = { head: await git(['rev-parse', 'HEAD']), branch: await git(['branch', '--show-current']), worktree_clean: (await git(['status', '--porcelain=v1', '--untracked-files=all'])) === '' };
  const lockfiles = await Promise.all(snapshot.inventory.filter((item) => item.path.endsWith('lock.yaml') || item.path.endsWith('lock.json')).map(async (item) => ({ path: item.path, sha256: item.sha256 })));
  const inputTree = await canonicalTreeEvidence(staging, canonicalInputExclusions);
  await cp(staging, resolve(candidate, 'canonical-corpus'), { recursive: true, errorOnExist: true });
  const artifacts = await buildArtifacts(candidate);
  const manifest: Json = {
    parent_run_id: parentRunId, created_at: new Date().toISOString(), qualification_input: 'LOCAL_SOURCE_SNAPSHOT', git: gitState,
    source_snapshot: { algorithm: 'SHA-256', scope: 'Intended source, corpus, tooling, tests, configuration, lockfiles, docs/, CANON.md, and AI_DOC_FRAMEWORK.md; notes, caches, dependencies, and build outputs excluded.', inventory: snapshot.inventory, digest: snapshot.digest },
    lockfile_digests: lockfiles,
    toolchains: {
      node: process.version, pnpm: await commandVersion(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version']),
      npm: await commandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']),
      python: await commandVersion(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version']), typescript: await commandVersion(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'tsc', '--version']),
    },
    test_source_sha256: aggregateDigest(snapshot.inventory, (path) => /(^|\/)(__tests__|tests|test|typing)(\/|\.)|\.test\.[^.]+$/.test(path)),
    qualifier_source_sha256: aggregateDigest(snapshot.inventory, (path) => path.startsWith('tools/')),
    canonical_input_tree: inputTree, artifacts,
    publication_inputs: Object.fromEntries(artifacts.map((artifact) => [`${artifact.kind}_sha256`, artifact.sha256])),
    matrix_inputs: Object.fromEntries(artifacts.map((artifact) => [`${artifact.kind}_sha256`, artifact.sha256])),
    governed_requirement: { receipt_path: normalized(resolve(staging, 'QUALIFICATION-RECEIPT.json')), required_status: 'PASS' },
    child_run_ids: Object.fromEntries(children.map((child) => [child.kind, child.run_id])),
  };
  const receipt: Json = {
    parent_run_id: parentRunId, status: 'STAGED', qualified_source_snapshot_sha256: snapshot.digest,
    qualified_artifacts: artifacts.map(({ kind, sha256: digest }) => ({ kind, sha256: digest })), final_canonical_tree: null,
    logical_dumps: [], governed_check_evidence: null, children, finished_at: null,
    promotion: { eligible: gitState.worktree_clean, blocker: gitState.worktree_clean ? null : 'DIRTY_OR_UNCOMMITTED_SOURCE' },
  };
  let storageEvidence = '';
  const qualification: AtomicQualification = { schema_version: '1.0.0', run_manifest: manifest, run_receipt: receipt };
  const manifestPath = resolve(candidate, 'RUN-MANIFEST.json'); const receiptPath = resolve(candidate, 'RUN-RECEIPT.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const tarball = resolve(root, String(artifacts.find((item) => item.kind === 'core-tarball')?.path));
  const wheel = resolve(root, String(artifacts.find((item) => item.kind === 'python-wheel')?.path));
  const codecTarball = resolve(root, String(artifacts.find((item) => item.kind === 'codec-tarball')?.path));
  const effectTarball = resolve(root, String(artifacts.find((item) => item.kind === 'effect-adapter-tarball')?.path));
  const artifactDigests = Object.fromEntries(artifacts.map((artifact) => [artifact.kind, artifact.sha256]));
  const externalEvidence = async (kind: EvidenceKind, details: Json): Promise<EvidenceArtifact> => {
    const path = resolve(candidate, `${kind.toUpperCase()}-EVIDENCE.json`);
    await writeFile(path, `${JSON.stringify({ schema_version: '1.0.0', kind, status: 'PASS', artifact_sha256: artifactDigests, details }, null, 2)}\n`);
    return { kind, path: normalized(path), ...await fileDigest(path), artifact_sha256: artifactDigests };
  };
  const execute = async (kind: ChildKind, action: () => Promise<{ summary: string; details: Json }>): Promise<void> => {
    const child = children.find((item) => item.kind === kind) as ChildResult;
    try { const result = await action(); child.evidence = result.summary; child.evidence_artifact = await externalEvidence(kind, result.details); child.status = 'PASS'; }
    catch (error) { child.status = 'FAIL'; child.evidence = error instanceof Error ? error.message.slice(0, 2000) : String(error); throw error; }
    finally { await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`); }
  };
  try {
    await execute('structural', async () => { await validateCorpus(staging, { enforceQualificationGates: false, replacingQualificationReceipt: true }); return { summary: 'Strict schema, semantic, graph, and traceability validation passed while the governed receipt was being atomically replaced.', details: { validation: 'PASS', replaced_document: 'QUALIFICATION-RECEIPT.json' } }; });
    await execute('canonical-scenario', async () => { const results = await runConformance({ tarball, runId: children[1]!.run_id, writeEvidence: false }); const failed = results.filter((item) => !item.passed).length; if (failed) throw new Error(`${failed}/${results.length} canonical scenarios failed`); return { summary: `${results.length}/${results.length} canonical scenarios passed against the exact core tarball without rebuilding.`, details: { total: results.length, passed: results.length, failed } }; });
    await execute('cross-language-matrix', async () => {
      return qualifyMatrix(artifacts.find((item) => item.kind === 'core-tarball')!, artifacts.find((item) => item.kind === 'python-wheel')!);
    });
    await execute('core-modularity', async () => ({ summary: 'Normative source hygiene and exact packed core manifest, ESM/CJS runtime subpaths, type subpaths, root parity, dependency isolation, internal closure, and import side effects passed.', details: { ...await qualifyCoreModularity(tarball, publicModuleRegistry, resolve(root, `tools/contract-registry/node_modules/.bin/${process.platform === 'win32' ? 'tsc.cmd' : 'tsc'}`)), source_hygiene: sourceHygiene.details } }));
    await execute('cause-exit-exact-artifacts', async () => {
      const result = await runCauseExitQualification([
        { kind: 'typescript-tarball', path: tarball, sha256: artifacts.find((item) => item.kind === 'core-tarball')!.sha256 },
        { kind: 'python-wheel', path: wheel, sha256: artifacts.find((item) => item.kind === 'python-wheel')!.sha256 },
      ], { stagingRoot: staging, runId: children.find((item) => item.kind === 'cause-exit-exact-artifacts')!.run_id });
      return { summary: result.summary, details: result.matrix };
    });
    await execute('json-codec', async () => {
      const vector = await fileDigest(codecVectors);
      return { summary: `Exact codec/core tarballs and wheel passed equivalent TypeScript/Python vectors bound to sha256:${vector.sha256}.`, details: { vector_sha256: vector.sha256, vector_size: vector.size, ...(await qualifyJsonCodec(tarball, codecTarball, wheel, codecVectors)) } };
    });
    await execute('effect-adapter', async () => ({ summary: 'Exact Effect adapter/core tarballs passed all Cause/Exit mapping and loss probes with effect@3.22.1; core has no Effect dependency.', details: await qualifyEffectAdapter(tarball, effectTarball) }));
    await execute('python-wheel', async () => ({ summary: await qualifyPythonArtifact(wheel), details: { wheel_sha256: artifacts.find((item) => item.kind === 'python-wheel')!.sha256 } }));
    await execute('storage', async () => {
      const temp = await mkdtemp(resolve(tmpdir(), 'resultsafe-atomic-storage-'));
      try {
        const profiles = [
          { kind: 'storage-cause-exit-dump' as const, options: { profiles: ['cause-exit'], replacingQualificationReceipt: true }, filename: 'sqlite-cause-exit-logical-dump.jsonl' },
          { kind: 'storage-structured-failure-dump' as const, options: { profiles: ['structured-failure'], replacingQualificationReceipt: true }, filename: 'sqlite-structured-failure-logical-dump.jsonl' },
          { kind: 'storage-base-dump' as const, options: { replacingQualificationReceipt: true }, filename: 'sqlite-base-logical-dump.jsonl' },
        ];
        const results: Json[] = [];
        for (const profile of profiles) {
          const result = await qualifyProjection(staging, temp, profile.options);
          const dumpPath = resolve(candidate, profile.filename);
          await writeFile(dumpPath, logicalDump(resolve(temp, 'projection-a.sqlite')));
          const reference = { kind: profile.kind, path: normalized(dumpPath), ...await fileDigest(dumpPath), artifact_sha256: artifactDigests };
          (receipt['logical_dumps'] as Json[]).push(reference);
          results.push({ kind: profile.kind, tables: result.tables, dump_sha256: result.dumpSha256 });
        }
        storageEvidence = `Base, structured-failure, and cause-exit STRICT projections produced three independently hashed logical dump artifacts; cause-exit resolved its structured-failure dependency.`;
        return { summary: storageEvidence, details: { profiles: results } };
      } finally { await rm(temp, { recursive: true, force: true }); }
    });
    await execute('integrity', async () => { await checkIntegrityManifest(staging); const current = await canonicalTreeEvidence(staging, canonicalInputExclusions); if (!sameJson(current, inputTree)) throw new Error('Immutable canonical qualification inputs changed after the run manifest was staged.'); return { summary: `Canonical input tree ${inputTree.digest} with explicit volatile-output exclusions and the current integrity manifest passed.`, details: { canonical_input_tree_sha256: inputTree.digest } }; });
    receipt['status'] = 'PASS'; receipt['finished_at'] = new Date().toISOString();

    const corpus = await loadCorpus(staging);
    const checkEvidence: Readonly<Record<string, string>> = {
      'schema-validation': `Contract registry validated ${corpus.documents.size} trusted canonical documents against ${corpus.schemas.length} strict schemas`,
      'semantic-validation': `Contract registry resolved identity, references, source bindings, and ${corpus.entities.size} materialized entities`,
      'traceability-validation': `Contract registry verified traceability closure across ${corpus.scenarios.size} executed scenarios`,
      'json-and-duplicate-keys': `Parsed ${corpus.documents.size} trusted canonical documents and ${corpus.schemas.length} schemas with duplicate-key rejection`,
      'json-schema-2020-12': `Validated ${corpus.documents.size} trusted canonical documents against ${corpus.schemas.length} strict Draft 2020-12 schemas`,
      'identity-and-reference-integrity': `Resolved identity, references, source bindings, and ${corpus.entities.size} materialized entities`,
      'traceability-closure': `Verified traceability closure across ${corpus.scenarios.size} executed scenarios`,
      'relational-and-sqlite-logical-equivalence': storageEvidence,
    };
    const governedChecks = Object.entries(checkEvidence).map(([check_key, evidence]) => ({ check_key, status: 'PASS', evidence }));
    governedChecks.push({ check_key: 'source-artifact-atomic-binding', status: 'PASS', evidence: `Parent ${parentRunId}; source sha256:${snapshot.digest}; ${artifacts.map((item) => `${item.kind} sha256:${item.sha256}`).join('; ')}; all ${children.length} UUIDv7 child gates PASS` });
    receipt['governed_check_evidence'] = await externalEvidence('governed-checks', { governed_receipt_path: normalized(resolve(staging, 'QUALIFICATION-RECEIPT.json')), proposed_checks: governedChecks });
    await validateCorpus(staging, { enforceQualificationGates: false, replacingQualificationReceipt: true }); await checkIntegrityManifest(staging);
    receipt['final_canonical_tree'] = await canonicalTreeEvidence(staging, finalCanonicalTreeExclusions);
    const validationContext = { root, canonicalRoot: staging, governedReceiptPath: resolve(staging, 'QUALIFICATION-RECEIPT.json') };
    const errors = await validateAtomicQualification(qualification, validationContext); if (errors.length) throw new Error(`Atomic binding validation failed: ${errors.join(', ')}`);
    await mutationSelfCheck(qualification, validationContext);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ parent_run_id: parentRunId, source_snapshot_sha256: snapshot.digest, artifacts, logical_dumps: receipt['logical_dumps'], canonical_input_tree_sha256: inputTree.digest, final_canonical_tree_sha256: (receipt['final_canonical_tree'] as Json)['digest'], children, promotion: receipt['promotion'] }, null, 2));
    return qualification;
  } catch (error) {
    receipt['status'] = 'FAIL'; receipt['finished_at'] = new Date().toISOString();
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    throw error;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runAtomicQualification();

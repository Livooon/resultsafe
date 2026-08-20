import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  canonicalInputExclusions, canonicalTreeEvidence, finalCanonicalTreeExclusions, sourceSnapshot,
  validateAtomicQualification, validateSourceHygiene, type AtomicQualification, type AtomicValidationContext,
} from './atomic-qualification.js';

const id = (suffix: string): string => `018f0000-0000-7000-8000-${suffix.padStart(12, '0')}`;
const kinds = ['structural', 'canonical-scenario', 'cross-language-matrix', 'core-modularity', 'cause-exit-exact-artifacts', 'json-codec', 'effect-adapter', 'python-wheel', 'storage', 'integrity'] as const;
const artifactKinds = ['core-tarball', 'python-wheel', 'codec-tarball', 'effect-adapter-tarball'] as const;
const dumpKinds = ['storage-base-dump', 'storage-structured-failure-dump', 'storage-cause-exit-dump'] as const;
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const sourceHygienePolicy = {
  governed_roots: ['packages/core/fp/result/src'],
  forbidden_colocated_generated_suffixes: ['.js', '.d.ts', '.d.ts.map'],
  ignored_local_only_paths: ['notes/', 'platform/candidates/', '.resultsafe-candidates/'],
  required_gitignore_rules: [
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.js' },
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.d.ts' },
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.d.ts.map' },
    { owning_file: '.gitignore', rule: 'notes/' },
    { owning_file: '.gitignore', rule: 'platform/candidates/' },
    { owning_file: '.gitignore', rule: '.resultsafe-candidates/' },
  ],
  source_snapshot_rule: { forbidden_generated_outputs: 'MUST_NOT_CONTAIN', local_only_paths: 'MUST_NOT_CONTAIN' },
  enforcement: 'NORMATIVE_PRE_SOURCE_SNAPSHOT', qualification_gate: 'core-modularity', evidence_owner: 'core-modularity',
};
const validIgnoreFiles = {
  'packages/core/fp/result/.gitignore': 'src/**/*.js\nsrc/**/*.d.ts\nsrc/**/*.d.ts.map\n',
  '.gitignore': 'notes/\nplatform/candidates/\n.resultsafe-candidates/\n',
};

const hygieneErrors = (changes: Partial<Parameters<typeof validateSourceHygiene>[0]> = {}): string[] => validateSourceHygiene({
  policy: structuredClone(sourceHygienePolicy), inventory_paths: ['packages/core/fp/result/src/index.ts'],
  intended_source_snapshot_paths: ['packages/core/fp/result/src/index.ts'], tracked_paths: ['packages/core/fp/result/src/index.ts'],
  gitignore_files: validIgnoreFiles, ...changes,
}).errors;

interface Fixture { qualification: AtomicQualification; context: AtomicValidationContext; root: string; canonical: string; evidencePaths: Map<string, string>; artifactPaths: Map<string, string> }

const setup = async (): Promise<Fixture> => {
  const root = await mkdtemp(resolve(tmpdir(), 'resultsafe-atomic-test-'));
  const canonical = resolve(root, 'canonical'); await mkdir(canonical);
  await Promise.all([
    writeFile(resolve(root, 'source.txt'), 'source-v1'),
    ...artifactKinds.map((kind) => writeFile(resolve(root, `${kind}.bin`), `${kind}-v1`)),
    writeFile(resolve(canonical, 'INPUT.json'), '{"value":1}\n'), writeFile(resolve(canonical, 'WAVE-PLAN.json'), '{"run":1}\n'),
    writeFile(resolve(canonical, 'INTEGRITY-MANIFEST.json'), '{"files":[]}\n'),
    writeFile(resolve(canonical, 'QUALIFICATION-RECEIPT.json'), '{"payload":{"structural_status":"PASS","behavioral_status":"PASS"}}\n'),
  ]);
  const source = await sourceSnapshot(root, ['source.txt']);
  const artifacts = await Promise.all(artifactKinds.map(async (kind) => { const path = `${kind}.bin`; const bytes = await readFile(resolve(root, path)); return { kind, path, size: bytes.length, sha256: sha256(bytes) }; }));
  const artifactDigests = Object.fromEntries(artifacts.map((item) => [item.kind, item.sha256]));
  const evidencePaths = new Map<string, string>();
  const evidence = async (kind: string) => {
    const path = `${kind}.json`; const bytes = Buffer.from(JSON.stringify({ kind, status: 'PASS' }));
    await writeFile(resolve(root, path), bytes); evidencePaths.set(kind, path);
    return { kind, path, size: bytes.length, sha256: sha256(bytes), artifact_sha256: artifactDigests };
  };
  const childEvidence = await Promise.all(kinds.map(evidence));
  const logicalDumps = await Promise.all(dumpKinds.map(evidence));
  const governedEvidence = await evidence('governed-checks');
  const inputTree = await canonicalTreeEvidence(canonical, canonicalInputExclusions);
  const finalTree = await canonicalTreeEvidence(canonical, finalCanonicalTreeExclusions);
  const publicationInputs = Object.fromEntries(artifacts.map((item) => [`${item.kind}_sha256`, item.sha256]));
  const qualification: AtomicQualification = {
    schema_version: '1.0.0',
    run_manifest: {
      parent_run_id: id('1'), git: { worktree_clean: false }, source_snapshot: source, canonical_input_tree: inputTree, artifacts,
      publication_inputs: publicationInputs, matrix_inputs: publicationInputs, governed_requirement: { required_status: 'PASS' },
      child_run_ids: Object.fromEntries(kinds.map((kind, index) => [kind, id(String(index + 2))])),
    },
    run_receipt: {
      parent_run_id: id('1'), status: 'PASS', qualified_source_snapshot_sha256: source.digest, final_canonical_tree: finalTree,
      qualified_artifacts: artifacts.map(({ kind, sha256: digest }) => ({ kind, sha256: digest })), logical_dumps: logicalDumps,
      governed_check_evidence: governedEvidence,
      children: kinds.map((kind, index) => ({ kind, run_id: id(String(index + 2)), parent_run_id: id('1'), status: 'PASS', evidence: 'PASS evidence', evidence_artifact: childEvidence[index] })),
      promotion: { eligible: false, blocker: 'DIRTY_OR_UNCOMMITTED_SOURCE' },
    },
  };
  return { qualification, context: { root, canonicalRoot: canonical, governedReceiptPath: resolve(canonical, 'QUALIFICATION-RECEIPT.json'), sourcePaths: ['source.txt'] }, root, canonical, evidencePaths, artifactPaths: new Map(artifacts.map((item) => [item.kind, item.path])) };
};

const mutationTest = (name: string, mutate: (fixture: Fixture) => void | Promise<void>): void => {
  test(`rejects changed ${name}`, async () => {
    const fixture = await setup();
    try { await mutate(fixture); assert.notDeepEqual(await validateAtomicQualification(fixture.qualification, fixture.context), []); }
    finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
};

test('accepts recomputed atomic evidence', async () => {
  const fixture = await setup();
  try { assert.deepEqual(await validateAtomicQualification(fixture.qualification, fixture.context), []); }
  finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test('accepts canonical source hygiene inputs', () => assert.deepEqual(hygieneErrors(), []));

test('rejects a tracked colocated generated file', () => {
  assert.ok(hygieneErrors({
    inventory_paths: ['packages/core/fp/result/src/index.ts', 'packages/core/fp/result/src/index.js'],
    tracked_paths: ['packages/core/fp/result/src/index.ts', 'packages/core/fp/result/src/index.js'],
  }).some((error) => error.includes('git cached inventory')));
});

for (const path of ['notes/private.md', 'platform/candidates/release.json', '.resultsafe-candidates/run/evidence.json']) {
  test(`rejects admitted local-only path ${path}`, () => {
    assert.ok(hygieneErrors({ inventory_paths: ['packages/core/fp/result/src/index.ts', path] }).some((error) => error.includes('local-only paths')));
  });
}

test('rejects a missing owning gitignore rule', () => {
  assert.ok(hygieneErrors({ gitignore_files: { ...validIgnoreFiles, '.gitignore': 'notes/\n.resultsafe-candidates/\n' } }).some((error) => error.includes('platform/candidates/')));
});

mutationTest('source corpus bytes', ({ root }) => writeFile(resolve(root, 'source.txt'), 'source-v2'));
mutationTest('canonical input corpus bytes', ({ canonical }) => writeFile(resolve(canonical, 'INPUT.json'), '{"value":2}\n'));
mutationTest('final canonical tree', ({ canonical }) => writeFile(resolve(canonical, 'WAVE-PLAN.json'), '{"run":2}\n'));
mutationTest('FAIL aggregate status when governed PASS is required', ({ qualification }) => { qualification.run_receipt.status = 'FAIL'; });
mutationTest('STAGED aggregate status when governed PASS is required', ({ qualification }) => { qualification.run_receipt.status = 'STAGED'; });
mutationTest('missing child set member', ({ qualification }) => { (qualification.run_receipt.children as unknown[]).pop(); });
mutationTest('extra child set member', ({ qualification }) => { (qualification.run_receipt.children as unknown[]).push({ kind: 'extra', run_id: id('99'), parent_run_id: id('1'), status: 'PASS' }); });

for (const kind of artifactKinds) mutationTest(`${kind} artifact bytes`, ({ root, artifactPaths }) => writeFile(resolve(root, artifactPaths.get(kind)!), 'mutated'));
for (const kind of ['core-modularity', 'cause-exit-exact-artifacts', 'json-codec', 'effect-adapter'] as const) mutationTest(`${kind} child binding`, ({ qualification }) => { const child = (qualification.run_receipt.children as Record<string, unknown>[]).find((item) => item['kind'] === kind)!; child['run_id'] = id('99'); });
for (const kind of [...kinds, ...dumpKinds, 'governed-checks']) mutationTest(`${kind} evidence bytes`, ({ root, evidencePaths }) => writeFile(resolve(root, evidencePaths.get(kind)!), 'mutated'));

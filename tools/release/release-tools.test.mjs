import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  assertReleaseAllowed,
  changedPathsAgainstBase,
  createChangeset,
  loadPendingOptionTransitionPolicy,
  parseChangeset,
  repositoryRoot,
  requireChangesetsForApiChanges,
  validatePendingChangesets,
} from './release-tools.mjs';

const temporary = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
const write = async (root, path, content) => {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
};
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'resultsafe-release-'));
  temporary.push(root);
  await mkdir(join(root, 'tools/release'), { recursive: true });
  await cp(resolve(repositoryRoot, 'tools/release/release-policy.json'), join(root, 'tools/release/release-policy.json'), { recursive: true });
  await cp(resolve(repositoryRoot, 'tools/release/pending-option-transition-policy.json'), join(root, 'tools/release/pending-option-transition-policy.json'));
  const policyPath = join(root, 'tools/release/release-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.transitionState = 'PENDING';
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  await write(root, 'packages/core/fp/result/package.json', '{"name":"@resultsafe/core-fp-result","version":"0.2.1"}\n');
  await write(root, 'packages/core/fp/option/package.json', '{"name":"@resultsafe/core-fp-option","version":"1.0.0"}\n');
  await mkdir(join(root, '.changeset'), { recursive: true });
  return root;
};
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

test('parses strict Changesets metadata and rejects malformed input', () => {
  assert.deepEqual(parseChangeset('---\n"@resultsafe/core-fp-result": minor\n---\n\nBreaking release\n').releases, [
    { name: '@resultsafe/core-fp-result', type: 'minor' },
  ]);
  assert.throws(() => parseChangeset('---\nname: minor\n---\nsummary'), /invalid release metadata/);
});

test('creates a noninteractive path-safe changeset and validates exact pending version', async () => {
  const root = await fixture();
  const path = await createChangeset({ packageName: '@resultsafe/core-fp-result', summary: 'Document the governed breaking candidate.', id: 'safe-release' }, root);
  assert.match(await readFile(path, 'utf8'), /core-fp-result": minor/);
  const result = await validatePendingChangesets(root);
  assert.equal(result.releases.get('@resultsafe/core-fp-result'), 'minor');
  await assert.rejects(createChangeset({ packageName: '@resultsafe/core-fp-result', summary: 'Document another candidate safely.', id: '../escape' }, root), /safe lowercase slug/);
});

test('fails closed for unlisted packages and unauthorized bumps', async () => {
  const root = await fixture();
  await assert.rejects(createChangeset({ packageName: '@resultsafe/unknown', summary: 'This package is not authorized.', id: 'unknown-release' }, root), /not in the release allowlist/);
  await assert.rejects(createChangeset({ packageName: '@resultsafe/core-fp-result', bump: 'major', summary: 'This bump is not authorized.', id: 'major-release' }, root), /not allowed/);
  await assert.rejects(validatePendingChangesets(root), /No pending changeset/);
  await assert.rejects(assertReleaseAllowed('@resultsafe/unknown', '1.0.0', root), /No pending changeset|not in the release allowlist/);
});

test('detects committed, working-tree, and untracked API paths against a merge base', async () => {
  const root = await fixture();
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'release-test@example.invalid');
  git(root, 'config', 'user.name', 'Release Test');
  await write(root, 'README.md', 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  await write(root, 'packages/core/fp/result/src/index.ts', 'export const committed = true;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'api');
  await write(root, 'packages/core/fp/result/package.json', '{"name":"@resultsafe/core-fp-result","version":"0.2.1","type":"module"}\n');
  await write(root, 'packages/core/fp/result/src/new.ts', 'export const untracked = true;\n');
  const result = changedPathsAgainstBase(root);
  assert.equal(result.baseCommit, base);
  assert.deepEqual(result.paths.filter((path) => path.startsWith('packages/core/fp/result/')), [
    'packages/core/fp/result/package.json',
    'packages/core/fp/result/src/index.ts',
    'packages/core/fp/result/src/new.ts',
  ]);
});

test('treats an applied governed transition as API change coverage', async () => {
  const root = await fixture();
  const policyPath = join(root, 'tools/release/release-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.transitionState = 'APPLIED_LOCAL';
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  await write(root, 'packages/core/fp/result/package.json', '{"name":"@resultsafe/core-fp-result","version":"0.3.0"}\n');
  await write(root, 'packages/core/fp/option/package.json', '{"name":"@resultsafe/core-fp-option","version":"1.0.0"}\n');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'release-test@example.invalid');
  git(root, 'config', 'user.name', 'Release Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'applied transition');
  const base = git(root, 'rev-parse', 'HEAD');
  await write(root, 'packages/core/fp/result/src/new.ts', 'export const additive = true;\n');
  const result = await requireChangesetsForApiChanges(root, base);
  assert.ok(result.paths.includes('packages/core/fp/result/src/new.ts'));
});

test('applied guard permits only the exact Result package and version', async () => {
  const root = await fixture();
  const policyPath = join(root, 'tools/release/release-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.transitionState = 'APPLIED_LOCAL';
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  await write(root, 'packages/core/fp/result/package.json', '{"name":"@resultsafe/core-fp-result","version":"0.3.0"}\n');
  assert.equal(await assertReleaseAllowed('@resultsafe/core-fp-result', '0.3.0', root), '0.3.0');
  await assert.rejects(assertReleaseAllowed('@resultsafe/core-fp-result', '0.3.1', root), /not the exact governed release/);
  await assert.rejects(assertReleaseAllowed('@resultsafe/core-fp-option', '1.0.1', root), /not in the release allowlist/);
});

test('records Option as a separate pending transition', async () => {
  const root = await fixture();
  const policy = await loadPendingOptionTransitionPolicy(root);
  assert.equal(policy.transitionState, 'PENDING_SEPARATE_RELEASE');
  assert.equal(policy.package.name, '@resultsafe/core-fp-option');
  assert.equal(policy.package.pendingVersion, '1.0.1');
});

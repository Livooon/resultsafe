import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { repositoryRoot } from './release-tools.mjs';
import { validateQualificationRun, verifyQualificationEvidence } from './candidate.mjs';

const workflow = (name) => readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8');

test('all GitHub Actions are immutable SHA pinned with version comments', async () => {
  for (const name of ['ci-versioning.yml', 'examples.yml', 'release-result.yml']) {
    const text = await workflow(name);
    const uses = [...text.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#\s*(v\S+))?$/gm)];
    assert.ok(uses.length > 0, `${name} has no actions`);
    for (const match of uses) {
      assert.match(match[1], /^[^@]+@[0-9a-f]{40}$/, `${name}: ${match[0]}`);
      assert.match(match[2] ?? '', /^v\d/, `${name} action pin has no version comment`);
    }
  }
});

test('promotion consumes an explicit qualified artifact and publishes only verified bytes', async () => {
  const text = await workflow('release-result.yml');
  for (const input of ['qualification_run_id', 'candidate_id', 'manifest_sha256', 'tarball_sha256']) assert.match(text, new RegExp(`^      ${input}:`, 'm'));
  assert.match(text, /environment: npm-production/);
  assert.match(text, /id-token: write/);
  assert.match(text, /run-id: \$\{\{ inputs\.qualification_run_id \}\}/);
  assert.match(text, /name: qualified-\$\{\{ inputs\.candidate_id \}\}/);
  assert.match(text, /candidate\.mjs verify-run/);
  assert.match(text, /ref: \$\{\{ steps\.qualification\.outputs\.source_sha \}\}/);
  assert.match(text, /candidate\.mjs verify-qualification/);
  assert.match(text, /check-allowlist\.mjs @resultsafe\/core-fp-result 0\.3\.0/);
  assert.match(text, /npm publish "\$\{\{ steps\.verify\.outputs\.tarball \}\}" --access public --provenance/);
  assert.doesNotMatch(text, /changeset publish|version:prepare|build:release/);
  assert.doesNotMatch(text, /^\s*run:.*\$\{\{ inputs\./m);
  assert.equal((text.match(/NODE_AUTH_TOKEN/g) ?? []).length, 1);
});

test('qualification workflow covers supported runtimes and gated exact candidate promotion', async () => {
  const text = await workflow('ci-versioning.yml');
  assert.match(text, /node: \[22\.13\.0, 24\]/);
  assert.match(text, /python: \["3\.11", "3\.12", "3\.13", "3\.14"\]/);
  for (const command of ['contracts:validate', 'contracts:conformance', 'contracts:matrix', 'qualify:atomic', 'storage:test', 'storage:qualify', 'release:tools:test']) assert.ok(text.includes(command), command);
  assert.doesNotMatch(text, /^\s*run: pnpm run languages:qualify$/m);
  assert.match(text, /RESULTSAFE_QUALIFIED_TARBALL: \$\{\{ steps\.candidate\.outputs\.tarball \}\}/);
  assert.match(text, /needs: \[authorize-source, build-candidate, node-package, contracts-storage-release-tools, python\]/);
  assert.match(text, /name: qualified-\$\{\{ needs\.build-candidate\.outputs\.candidate_id \}\}/);
  assert.match(text, /git merge-base --is-ancestor "\$REQUESTED_SHA" origin\/main/);
  assert.match(text, /release:guard:result/);
  assert.match(text, /candidate\.mjs record-qualification/);
  assert.match(text, /Final exact-byte verification[\s\S]*?candidate\.mjs verify \\\n\s+--directory=.* \\\n\s+"--candidate-id=\$CANDIDATE_ID" \\/);
  assert.match(text, /Record promotion inputs[\s\S]*?run: >-\n\s+printf '### Qualified candidate/);
  assert.match(text, /Upload unqualified candidate\n\s+if: needs\.authorize-source\.outputs\.authorized == 'true'/);
  assert.match(text, /Upload qualified immutable candidate/);
});

test('qualification run validation rejects unauthorized repository, workflow, SHA, and conclusion', () => {
  const valid = { id: 123, run_attempt: 1, repository: { full_name: 'resultsafe/resultsafe' }, path: '.github/workflows/ci-versioning.yml', event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40) };
  assert.equal(validateQualificationRun(valid, '123').runSha, 'a'.repeat(40));
  for (const altered of [
    { repository: { full_name: 'attacker/fork' } },
    { path: '.github/workflows/other.yml' },
    { head_sha: 'not-a-sha' },
    { conclusion: 'failure' },
    { head_branch: 'feature' },
  ]) assert.throws(() => validateQualificationRun({ ...valid, ...altered }, '123'), /not an authorized successful governed run/);
  assert.throws(() => validateQualificationRun(valid, '999'), /not an authorized successful governed run/);
});

test('qualification evidence self-verifies its numeric schema version', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'resultsafe-qualification-'));
  const record = { schemaVersion: 1, repository: 'resultsafe/resultsafe', workflow: '.github/workflows/ci-versioning.yml', event: 'push', ref: 'refs/heads/main', runId: '123', runAttempt: '1', runSha: 'a'.repeat(40), conclusion: 'success', candidateId: 'candidate-123' };
  try {
    await writeFile(resolve(directory, 'qualification-run.json'), JSON.stringify(record));
    assert.deepEqual(await verifyQualificationEvidence(directory, record), record);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('workspace policy has one lockfile and enforced runtime floors', async () => {
  await assert.rejects(access(resolve(repositoryRoot, 'packages/core/fp/result/package-lock.json')));
  const rootPackage = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  const resultPackage = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/core/fp/result/package.json'), 'utf8'));
  assert.equal(rootPackage.engines.node, '>=22.13.0');
  assert.equal(resultPackage.engines.node, '>=22.13.0');
  const constraints = await readFile(resolve(repositoryRoot, 'requirements/qualification.txt'), 'utf8');
  assert.doesNotMatch(constraints, />=|~=|\*|--extra-index-url/);
});

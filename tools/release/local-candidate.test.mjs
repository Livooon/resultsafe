import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { promotionPreflight, sealCandidate, verifyLocalCandidate } from './local-candidate.mjs';

const temporary = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
const id = '018f0000-0000-7000-8000-000000000001';
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resultsafe-local-candidate-')); temporary.push(directory);
  await writeFile(join(directory, 'payload.bin'), 'qualified bytes');
  await writeFile(join(directory, 'qualification-atomic-receipt.json'), JSON.stringify({ status: 'PASS', children: [{ status: 'PASS' }] }));
  await writeFile(join(directory, 'approval-state.json'), JSON.stringify({ candidateId: id, state: 'NOT_APPROVED', promotionBlockers: ['COMMIT_BOUND_REQUALIFICATION', 'OWNER_RELEASE_APPROVAL', 'GITHUB_ENVIRONMENT_CONFIGURATION'] }));
  const payload = await readFile(join(directory, 'payload.bin'));
  const crypto = await import('node:crypto'); const digest = crypto.createHash('sha256').update(payload).digest('hex');
  await sealCandidate(directory, { schemaVersion: 1, candidateId: id, candidatePath: `platform/candidates/resultsafe-core-fp-result/0.3.0/${id}`, status: 'QUALIFIED_LOCAL_RC', versions: { npm: '0.3.0', option: '1.0.1', python: '0.1.0' }, source: {}, artifacts: { payload: { file: 'payload.bin', size: payload.length, sha256: digest } }, qualification: {}, approval: { state: 'NOT_APPROVED', promotionBlockers: ['COMMIT_BOUND_REQUALIFICATION', 'OWNER_RELEASE_APPROVAL', 'GITHUB_ENVIRONMENT_CONFIGURATION'] } });
  return directory;
};

test('rejects tampered candidate bytes', async () => { const directory = await fixture(); await writeFile(join(directory, 'payload.bin'), 'tampered'); await assert.rejects(verifyLocalCandidate(directory), /inventory differs/); });
test('rejects a missing candidate file', async () => { const directory = await fixture(); await unlink(join(directory, 'payload.bin')); await assert.rejects(verifyLocalCandidate(directory), /inventory differs/); });
test('rejects an extra candidate file', async () => { const directory = await fixture(); await writeFile(join(directory, 'extra'), 'extra'); await assert.rejects(verifyLocalCandidate(directory), /inventory differs/); });
test('rejects a wrong declared tree digest', async () => { const directory = await fixture(); const path = join(directory, 'candidate-manifest.json'); const manifest = JSON.parse(await readFile(path, 'utf8')); manifest.treeSha256 = '0'.repeat(64); await writeFile(path, JSON.stringify(manifest)); await assert.rejects(verifyLocalCandidate(directory), /tree digest differs/); });
test('rejects promotion without approval', async () => { const directory = await fixture(); await assert.rejects(promotionPreflight(directory), /Promotion prohibited/); });

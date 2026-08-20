import assert from 'node:assert/strict';
import test from 'node:test';
import type { AtomicQualification } from './atomic-qualification.js';
import { preserveDeferredQualification, requirePassingQualification } from './adopt-atomic-qualification.js';

const kinds = ['structural', 'canonical-scenario', 'cross-language-matrix', 'core-modularity', 'cause-exit-exact-artifacts', 'json-codec', 'effect-adapter', 'python-wheel', 'storage', 'integrity'];
const qualification = (): AtomicQualification => ({
  schema_version: '1.0.0', run_manifest: {},
  run_receipt: { status: 'PASS', children: kinds.map((kind) => ({ kind, status: 'PASS' })) },
});

test('rejects a FAIL candidate', () => {
  const value = qualification(); value.run_receipt['status'] = 'FAIL';
  assert.throws(() => requirePassingQualification(value, []), /must be PASS/);
});

test('rejects a missing child', () => {
  const value = qualification(); (value.run_receipt['children'] as unknown[]).pop();
  assert.throws(() => requirePassingQualification(value, []), /exactly 10 children/);
});

test('rejects validator-reported tampered artifact bytes', () => {
  assert.throws(() => requirePassingQualification(qualification(), ['core-tarball artifact bytes']), /artifact bytes/);
});

test('preserves security and long-running DEFERRED statuses', () => {
  const next: Record<string, unknown> = {};
  preserveDeferredQualification({ security_status: 'DEFERRED', long_running_status: 'DEFERRED' }, next);
  assert.deepEqual(next, { security_status: 'DEFERRED', long_running_status: 'DEFERRED' });
  assert.throws(() => preserveDeferredQualification({ security_status: 'PASS', long_running_status: 'DEFERRED' }, {}), /must already be DEFERRED/);
});

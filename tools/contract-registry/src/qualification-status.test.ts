import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateBehavioralStatus, languageSurfaceStatus } from './qualification-status.js';

test('behavioral status requires both scenario and language PASS evidence', () => {
  assert.equal(aggregateBehavioralStatus('PASS', ['PASS', 'PASS']), 'PASS');
  assert.equal(aggregateBehavioralStatus('PASS', ['PASS', 'NOT_EXECUTED']), 'PARTIAL');
  assert.equal(aggregateBehavioralStatus('PASS', ['NOT_EXECUTED', 'NOT_EXECUTED']), 'PARTIAL');
});

test('behavioral status propagates failures and preserves fully unexecuted state', () => {
  assert.equal(aggregateBehavioralStatus('PASS', ['PASS', 'FAIL']), 'FAIL');
  assert.equal(aggregateBehavioralStatus('FAIL', ['PASS', 'PASS']), 'FAIL');
  assert.equal(aggregateBehavioralStatus('NOT_EXECUTED', ['NOT_EXECUTED', 'NOT_EXECUTED']), 'NOT_EXECUTED');
  assert.equal(aggregateBehavioralStatus('NOT_EXECUTED', ['PASS', 'PASS']), 'PARTIAL');
  assert.equal(languageSurfaceStatus(['PASS', 'PASS']), 'PASS');
  assert.equal(languageSurfaceStatus(['PASS', 'NOT_EXECUTED']), 'NOT_EXECUTED');
  assert.equal(languageSurfaceStatus(['PASS', 'FAIL']), 'FAIL');
});

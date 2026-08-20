import assert from 'node:assert/strict';
import test from 'node:test';
import { matrixCellFailures } from './matrix.js';

const binding = { operation_key: 'map-success', module_name: 'map', method_name: 'map' };
const outcome = {
  branch_outcomes: 'PASS', callback_contract: 'PASS', exception_contract: 'PASS', wrapper_payload_identity: 'PASS',
  laws: [{ law_key: 'map-identity', status: 'PASS' }],
  positive_types: 'NOT_ASSESSED_OPERATION_SPECIFIC', negative_types: 'NOT_ASSESSED_OPERATION_SPECIFIC',
};
const moduleCell = { surface: 'MODULE', binding, expected_outcome: outcome };
const methodCell = { surface: 'INSTANCE_METHOD', binding, expected_outcome: outcome };

test('swapping an operation binding fails the binding matrix cell', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, { ...binding, module_name: 'mapErr' }, outcome), ['binding']);
});

test('breaking only a method fails only the method cell', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, binding, outcome), []);
  assert.deepEqual(matrixCellFailures(methodCell, { ...binding, method_name: 'mapErr' }, outcome), ['binding']);
});

test('callback count mutation fails callback clauses', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, binding, { ...outcome, callback_contract: 'FAIL' }), ['callbacks']);
});

test('wrapper identity mutation fails identity clauses', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, binding, { ...outcome, wrapper_payload_identity: 'FAIL' }), ['identity']);
});

test('exception wrapping mutation fails exception clauses', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, binding, { ...outcome, exception_contract: 'FAIL' }), ['exceptions']);
});

test('generic package type PASS cannot satisfy operation-specific cell evidence', () => {
  assert.deepEqual(matrixCellFailures(moduleCell, binding, { ...outcome, positive_types: 'PASS', negative_types: 'PASS' }), ['types']);
});

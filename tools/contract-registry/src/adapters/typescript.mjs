import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const [packageRoot, cellsPath] = process.argv.slice(2);
const api = await import(pathToFileURL(`${packageRoot}/esm/index.js`).href);
const cells = JSON.parse(await readFile(cellsPath, 'utf8'));

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalized = (value) => value?.ok === true ? ['SUCCESS', value.value] :
  value?.ok === false ? ['FAILURE', value.error] :
  value?.some === true ? ['SOME', normalized(value.value)] : value?.some === false ? ['NONE'] : value;

const invoke = (binding, surface, receiver, args) => surface === 'MODULE'
  ? api[binding.module_name](receiver, ...args)
  : receiver[binding.method_name](...args);

const exercise = (cell) => {
  const { binding, operation_key: key, surface } = cell;
  const payload = { marker: key };
  const error = { marker: `${key}-error` };
  const ok = api.Ok(payload);
  const err = api.Err(error);
  const calls = [];
  const callback = (value) => { calls.push(value); return value; };
  const boom = new Error(`matrix-${key}`);
  const throwing = () => { throw boom; };
  let branch = true;
  let identity = true;
  let exception = true;
  switch (key) {
    case 'construct-success': { const first = api.Ok(payload); const second = api.Ok(payload); identity = first !== second && first.value === payload && Object.isFrozen(first); break; }
    case 'construct-failure': { const first = api.Err(error); const second = api.Err(error); identity = first !== second && first.error === error && Object.isFrozen(first); break; }
    case 'is-failure': branch = invoke(binding, surface, err, []) === true && invoke(binding, surface, ok, []) === false; break;
    case 'is-success': branch = invoke(binding, surface, ok, []) === true && invoke(binding, surface, err, []) === false; break;
    case 'is-failure-and':
      branch = invoke(binding, surface, err, [(value) => { calls.push(value); return true; }]) === true && invoke(binding, surface, ok, [callback]) === false;
      identity = calls.length === 1 && calls[0] === error;
      try { invoke(binding, surface, err, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    case 'is-success-and':
      branch = invoke(binding, surface, ok, [(value) => { calls.push(value); return true; }]) === true && invoke(binding, surface, err, [callback]) === false;
      identity = calls.length === 1 && calls[0] === payload;
      try { invoke(binding, surface, ok, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    case 'chain-success': {
      const produced = api.Ok(payload);
      const eligible = invoke(binding, surface, ok, [(value) => { calls.push(value); return produced; }]);
      const skipped = invoke(binding, surface, err, [callback]);
      branch = eligible === produced && skipped === err; identity = calls.length === 1 && calls[0] === payload;
      try { invoke(binding, surface, ok, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    }
    case 'failure-option': { const output = invoke(binding, surface, err, []); branch = same(normalized(output), ['SOME', error]) && same(normalized(invoke(binding, surface, ok, [])), ['NONE']); identity = output.value === error; break; }
    case 'success-option': { const output = invoke(binding, surface, ok, []); branch = same(normalized(output), ['SOME', payload]) && same(normalized(invoke(binding, surface, err, [])), ['NONE']); identity = output.value === payload; break; }
    case 'expect-success':
      branch = invoke(binding, surface, ok, ['unused']) === payload;
      try { invoke(binding, surface, err, ['matrix']); exception = false; } catch (caught) { exception = caught instanceof api.ResultExtractionError && caught.cause === error && caught.message === 'matrix'; }
      break;
    case 'expect-failure':
      branch = invoke(binding, surface, err, ['unused']) === error;
      try { invoke(binding, surface, ok, ['matrix']); exception = false; } catch (caught) { exception = caught instanceof api.ResultExtractionError && caught.cause === payload && caught.message === 'matrix'; }
      break;
    case 'flatten-result': {
      const inner = api.Ok(payload); branch = invoke(binding, surface, api.Ok(inner), []) === inner && invoke(binding, surface, err, []) === err; break;
    }
    case 'map-success': {
      const eligible = invoke(binding, surface, ok, [(value) => { calls.push(value); return error; }]);
      branch = eligible.ok && eligible.value === error && invoke(binding, surface, err, [callback]) === err;
      identity = calls.length === 1 && calls[0] === payload && eligible !== ok;
      try { invoke(binding, surface, ok, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    }
    case 'map-failure': {
      const eligible = invoke(binding, surface, err, [(value) => { calls.push(value); return payload; }]);
      branch = !eligible.ok && eligible.error === payload && invoke(binding, surface, ok, [callback]) === ok;
      identity = calls.length === 1 && calls[0] === error && eligible !== err;
      try { invoke(binding, surface, err, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    }
    case 'match-result':
      branch = invoke(binding, surface, ok, [(value) => { calls.push(['ok', value]); return 'ok'; }, (value) => { calls.push(['err', value]); return 'err'; }]) === 'ok' &&
        invoke(binding, surface, err, [(value) => { calls.push(['ok', value]); return 'ok'; }, (value) => { calls.push(['err', value]); return 'err'; }]) === 'err';
      identity = calls.length === 2 && calls[0][0] === 'ok' && calls[0][1] === payload && calls[1][0] === 'err' && calls[1][1] === error;
      try { invoke(binding, surface, ok, [throwing, callback]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    case 'recover-failure': {
      const produced = api.Ok(payload); const eligible = invoke(binding, surface, err, [(value) => { calls.push(value); return produced; }]);
      branch = eligible === produced && invoke(binding, surface, ok, [callback]) === ok; identity = calls.length === 1 && calls[0] === error;
      try { invoke(binding, surface, err, [throwing]); exception = false; } catch (caught) { exception = caught === boom; }
      break;
    }
    case 'tap-success':
      branch = invoke(binding, surface, ok, [callback]) === ok && invoke(binding, surface, err, [callback]) === err; identity = calls.length === 1 && calls[0] === payload;
      try { invoke(binding, surface, ok, [throwing]); exception = false; } catch (caught) { exception = caught === boom; } break;
    case 'tap-failure':
      branch = invoke(binding, surface, err, [callback]) === err && invoke(binding, surface, ok, [callback]) === ok; identity = calls.length === 1 && calls[0] === error;
      try { invoke(binding, surface, err, [throwing]); exception = false; } catch (caught) { exception = caught === boom; } break;
    case 'transpose-result-option': {
      const some = { some: true, value: payload }; const none = { some: false };
      branch = same(normalized(invoke(binding, surface, api.Ok(some), [])), ['SOME', ['SUCCESS', payload]]) &&
        same(normalized(invoke(binding, surface, api.Ok(none), [])), ['NONE']) &&
        same(normalized(invoke(binding, surface, err, [])), ['SOME', ['FAILURE', error]]);
      const output = invoke(binding, surface, api.Ok(some), []); identity = output.value.value === payload; break;
    }
    case 'unwrap-success':
      branch = invoke(binding, surface, ok, []) === payload;
      try { invoke(binding, surface, err, []); exception = false; } catch (caught) { exception = caught instanceof api.ResultExtractionError && caught.cause === error; } break;
    case 'unwrap-failure':
      branch = invoke(binding, surface, err, []) === error;
      try { invoke(binding, surface, ok, []); exception = false; } catch (caught) { exception = caught instanceof api.ResultExtractionError && caught.cause === payload; } break;
    case 'unwrap-or': branch = invoke(binding, surface, ok, [error]) === payload && invoke(binding, surface, err, [payload]) === payload; break;
    case 'unwrap-or-else':
      branch = invoke(binding, surface, ok, [callback]) === payload && invoke(binding, surface, err, [(value) => { calls.push(value); return payload; }]) === payload;
      identity = calls.length === 1 && calls[0] === error;
      try { invoke(binding, surface, err, [throwing]); exception = false; } catch (caught) { exception = caught === boom; } break;
    default: throw new Error(`unsupported neutral operation ${key}`);
  }
  if (!branch || !identity || !exception) throw new Error(`${cell.cell_key}: branch=${branch} identity=${identity} exception=${exception}`);
  const lawStatus = (law) => {
    if (law === 'result-exclusive-branch') return (api.Ok(payload).ok === true && !('error' in api.Ok(payload))) && (api.Err(error).ok === false && !('value' in api.Err(error)));
    if (law === 'map-identity') return same(normalized(api.map(ok, (value) => value)), normalized(ok)) && same(normalized(api.map(err, (value) => value)), normalized(err));
    if (law === 'tap-identity') return api.tap(ok, () => {}) === ok && api.tapErr(err, () => {}) === err;
    if (law === 'flatten-chain') {
      const next = (value) => api.Ok(value);
      return same(normalized(api.andThen(ok, next)), normalized(api.flatten(api.map(ok, next))));
    }
    if (law === 'match-single-callback') { let count = 0; api.match(ok, () => ++count, () => ++count); return count === 1; }
    throw new Error(`unsupported law ${law}`);
  };
  const lawResults = cell.law_keys.map((law_key) => ({ law_key, status: lawStatus(law_key) ? 'PASS' : 'FAIL' }));
  if (lawResults.some(({ status }) => status !== 'PASS')) throw new Error(`${cell.cell_key}: law failure`);
  return {
    cell_key: cell.cell_key,
    outcome: {
      branch_outcomes: 'PASS', callback_contract: 'PASS', exception_contract: 'PASS',
      wrapper_payload_identity: 'PASS', laws: lawResults,
      positive_types: 'NOT_ASSESSED_OPERATION_SPECIFIC', negative_types: 'NOT_ASSESSED_OPERATION_SPECIFIC',
    },
  };
};

console.log(JSON.stringify(cells.map(exercise)));

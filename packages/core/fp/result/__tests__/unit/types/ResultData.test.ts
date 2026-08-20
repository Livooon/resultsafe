import { describe, expect, it } from 'vitest';

import {
  Err,
  fromResultData,
  hydrateResult,
  map,
  Ok,
  toResultData,
  type ResultData,
} from '../../../src/index.js';

describe('ResultData transport boundary', () => {
  it('loses runtime methods at JSON, spread, assign, and clone boundaries', () => {
    const result = Ok({ id: 1 });
    const values = [
      JSON.parse(JSON.stringify(result)) as unknown,
      { ...result },
      Object.assign({}, result),
      structuredClone(result) as unknown,
    ];

    for (const value of values) {
      expect(value).toEqual({ ok: true, value: { id: 1 } });
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect('map' in (value as object)).toBe(false);
    }
  });

  it('projects pure branch data and explicitly restores canonical methods', () => {
    const payload = { id: 1 };
    const runtime = Ok(payload);
    const byFunction = toResultData(runtime);
    const byMethod = runtime.toResultData();

    for (const data of [byFunction, byMethod]) {
      expect(data).toEqual({ ok: true, value: payload });
      expect(Object.isFrozen(data)).toBe(true);
      expect('map' in data).toBe(false);
      const restored = fromResultData(data);
      expect(restored.value).toBe(payload);
      expect(restored.map((value) => value)).not.toBe(restored);
    }
  });

  it('canonicalizes data and foreign-copy wrappers but reuses local wrappers', () => {
    const local = Err('failure');
    const data: ResultData<number, string> = { ok: false, error: 'failure' };
    const foreign = Object.freeze(
      Object.assign(Object.create({ map: () => 'foreign' }) as object, data),
    ) as ResultData<number, string>;

    expect(hydrateResult(local)).toBe(local);
    for (const input of [data, foreign]) {
      const hydrated = hydrateResult(input);
      expect(hydrated).toEqual(local);
      expect(hydrated).not.toBe(input);
      expect(Object.getPrototypeOf(hydrated)).toBe(Object.getPrototypeOf(local));
      expect(Object.isFrozen(hydrated)).toBe(true);
    }
  });

  it('accepts ResultData in free functions and returns methodful wrappers', () => {
    const success: ResultData<number, string> = { ok: true, value: 2 };
    const failure: ResultData<number, string> = { ok: false, error: 'bad' };

    expect(map(success, (value) => value * 2).unwrap()).toBe(4);
    const passed = map(failure, (value) => value * 2);
    expect(passed).not.toBe(failure);
    expect(passed.unwrapErr()).toBe('bad');
  });
});

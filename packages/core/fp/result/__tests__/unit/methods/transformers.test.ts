import { describe, expect, it, vi } from 'vitest';

import { andThen } from '../../../src/methods/andThen.js';
import { flatten } from '../../../src/methods/flatten.js';
import { map } from '../../../src/methods/map.js';
import { mapErr } from '../../../src/methods/mapErr.js';
import { match } from '../../../src/methods/match.js';
import { orElse } from '../../../src/methods/orElse.js';

describe('methods/andThen', () => {
  it('maps Ok values through callback', () => {
    expect(
      andThen({ ok: true, value: 2 }, (v) => ({ ok: true, value: v * 2 })),
    ).toEqual({ ok: true, value: 4 });
  });

  it('hydrates Err data and does not call callback', () => {
    const input = { ok: false as const, error: 'boom' };
    const callback = vi.fn((v: number) => ({ ok: true as const, value: v }));
    const output = andThen(input, callback);
    expect(output).not.toBe(input);
    expect(output.unwrapErr()).toBe('boom');
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('methods/map', () => {
  it('maps Ok payload and preserves Err unchanged', () => {
    expect(map({ ok: true, value: 2 }, (v) => v + 1)).toEqual({
      ok: true,
      value: 3,
    });
    const err = { ok: false as const, error: 'x' };
    const output = map(err, (v: number) => v + 1);
    expect(output).not.toBe(err);
    expect(output.unwrapErr()).toBe('x');
  });
});

describe('methods/mapErr', () => {
  it('maps Err payload and preserves Ok unchanged', () => {
    expect(mapErr({ ok: false, error: 'x' }, (e) => e.toUpperCase())).toEqual({
      ok: false,
      error: 'X',
    });
    const ok = { ok: true as const, value: 1 };
    const output = mapErr(ok, (e: string) => e.toUpperCase());
    expect(output).not.toBe(ok);
    expect(output.unwrap()).toBe(1);
  });
});

describe('methods/orElse', () => {
  it('maps Err to alternative result and keeps Ok unchanged', () => {
    expect(
      orElse({ ok: false, error: 'x' }, (e) => ({ ok: false, error: `${e}!` })),
    ).toEqual({ ok: false, error: 'x!' });
    const ok = { ok: true as const, value: 7 };
    const output = orElse(ok, () => ({ ok: true as const, value: 0 }));
    expect(output).not.toBe(ok);
    expect(output.unwrap()).toBe(7);
  });
});

describe('methods/flatten', () => {
  it('flattens nested Ok and keeps outer Err', () => {
    expect(flatten({ ok: true, value: { ok: true, value: 1 } })).toEqual({
      ok: true,
      value: 1,
    });
    expect(flatten({ ok: false, error: 'boom' })).toEqual({
      ok: false,
      error: 'boom',
    });
  });
});

describe('methods/match', () => {
  it('dispatches to correct branch callback', () => {
    expect(
      match(
        { ok: true, value: 3 },
        (v) => v * 2,
        () => 0,
      ),
    ).toBe(6);
    expect(
      match(
        { ok: false, error: 'e' },
        () => 0,
        (e) => e.length,
      ),
    ).toBe(1);
  });
});

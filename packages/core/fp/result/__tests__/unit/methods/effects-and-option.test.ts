import { describe, expect, it, vi } from 'vitest';

import { err } from '../../../src/methods/err.js';
import { inspect } from '../../../src/methods/inspect.js';
import { inspectErr } from '../../../src/methods/inspectErr.js';
import { ok } from '../../../src/methods/ok.js';
import { tap } from '../../../src/methods/tap.js';
import { tapErr } from '../../../src/methods/tapErr.js';
import { transpose } from '../../../src/methods/transpose.js';

describe('methods/inspect', () => {
  it('is the tap function', () => {
    expect(inspect).toBe(tap);
  });

  it('runs effect only for Ok and hydrates ResultData', () => {
    const onValue = vi.fn();
    const okValue = { ok: true as const, value: 5 };
    const errValue = { ok: false as const, error: 'boom' };

    expect(inspect(okValue, onValue)).not.toBe(okValue);
    expect(inspect(errValue, onValue)).not.toBe(errValue);
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith(5);
  });
});

describe('methods/inspectErr', () => {
  it('is the tapErr function', () => {
    expect(inspectErr).toBe(tapErr);
  });

  it('runs effect only for Err and hydrates ResultData', () => {
    const onError = vi.fn();
    const okValue = { ok: true as const, value: 5 };
    const errValue = { ok: false as const, error: 'boom' };

    expect(inspectErr(okValue, onError)).not.toBe(okValue);
    expect(inspectErr(errValue, onError)).not.toBe(errValue);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('boom');
  });
});

describe('methods/tap', () => {
  it('runs callback only for Ok', () => {
    const callback = vi.fn();
    tap({ ok: true, value: 1 }, callback);
    tap({ ok: false, error: 'x' }, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(1);
  });
});

describe('methods/tapErr', () => {
  it('runs callback only for Err', () => {
    const callback = vi.fn();
    tapErr({ ok: true, value: 1 }, callback);
    tapErr({ ok: false, error: 'x' }, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('x');
  });
});

describe('methods/ok', () => {
  it('converts Ok to Some and Err to None', () => {
    expect(ok({ ok: true, value: 3 })).toEqual({ some: true, value: 3 });
    expect(ok({ ok: false, error: 'x' })).toEqual({ some: false });
  });

  it('returns a frozen None singleton', () => {
    const first = ok({ ok: false, error: 'x' });
    const second = ok({ ok: false, error: 'y' });

    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

describe('methods/err', () => {
  it('converts Err to Some and Ok to None', () => {
    expect(err({ ok: false, error: 'x' })).toEqual({ some: true, value: 'x' });
    expect(err({ ok: true, value: 3 })).toEqual({ some: false });
  });
});

describe('methods/transpose', () => {
  it('transposes Ok(Some) into Some(Ok)', () => {
    expect(transpose({ ok: true, value: { some: true, value: 9 } })).toEqual({
      some: true,
      value: { ok: true, value: 9 },
    });
  });

  it('transposes Ok(None) into None', () => {
    expect(transpose({ ok: true, value: { some: false } })).toEqual({
      some: false,
    });
  });

  it('transposes Err into Some(Err)', () => {
    expect(transpose({ ok: false, error: 'boom' })).toEqual({
      some: true,
      value: { ok: false, error: 'boom' },
    });
  });
});

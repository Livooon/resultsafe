import { describe, expect, it, vi } from 'vitest';

import { flatten } from '../../../src/methods/flatten.js';
import { match } from '../../../src/methods/match.js';
import { tap } from '../../../src/methods/tap.js';
import { transpose } from '../../../src/methods/transpose.js';
import { unwrapOrElse } from '../../../src/methods/unwrapOrElse.js';
import type { Option, Result } from '../../../src/types/core/index.js';

describe('exact Result discrimination', () => {
  it('dispatches a truthy non-boolean discriminator to match failure', () => {
    const malformed = {
      ok: 1,
      value: 1,
      error: 'failure',
    } as unknown as Result<number, string>;

    expect(
      match(
        malformed,
        () => 'success',
        (error) => error,
      ),
    ).toBe('failure');
  });

  it('canonicalizes a malformed outer value as failure in flatten', () => {
    const malformed = {
      ok: 1,
      value: { ok: true, value: 1 },
      error: 'failure',
    } as unknown as Result<Result<number, string>, string>;

    const output = flatten(malformed);
    expect(output).toEqual({ ok: false, error: 'failure' });
    expect(output).not.toBe(malformed);
    expect(output.unwrapErr()).toBe('failure');
  });

  it('does not run the success effect for a malformed discriminator', () => {
    const effect = vi.fn();
    const malformed = {
      ok: 1,
      value: 1,
      error: 'failure',
    } as unknown as Result<number, string>;

    const output = tap(malformed, effect);
    expect(output).toEqual({ ok: false, error: 'failure' });
    expect(output).not.toBe(malformed);
    expect(effect).not.toHaveBeenCalled();
  });

  it('uses the failure fallback for a malformed discriminator', () => {
    const fallback = vi.fn((error: string) => error.length);
    const malformed = {
      ok: 1,
      value: 1,
      error: 'failure',
    } as unknown as Result<number, string>;

    expect(unwrapOrElse(malformed, fallback)).toBe(7);
    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledWith('failure');
  });

  it('transposes a malformed discriminator as failure', () => {
    const malformed = {
      ok: 1,
      value: { some: false },
      error: 'failure',
    } as unknown as Result<Option<number>, string>;

    expect(transpose(malformed)).toEqual({
      some: true,
      value: { ok: false, error: 'failure' },
    });
  });
});

import { describe, expect, it } from 'vitest';

import { ResultExtractionError } from '../../../src/errors/ResultExtractionError.js';
import { expect as expectValue } from '../../../src/methods/expect.js';
import { expectErr } from '../../../src/methods/expectErr.js';
import { unwrap } from '../../../src/methods/unwrap.js';
import { unwrapErr } from '../../../src/methods/unwrapErr.js';
import { unwrapOr } from '../../../src/methods/unwrapOr.js';
import { unwrapOrElse } from '../../../src/methods/unwrapOrElse.js';

describe('methods/expect', () => {
  it('returns Ok value and throws custom message for Err', () => {
    expect(expectValue({ ok: true, value: 1 }, 'x')).toBe(1);
    expect(() =>
      expectValue({ ok: false, error: 'boom' }, 'custom'),
    ).toThrowError('custom');
  });

  it('preserves the Err payload as the extraction error cause', () => {
    const payload = { code: 'E_FAIL' };

    try {
      expectValue({ ok: false, error: payload }, 'custom');
      throw new Error('Expected extraction to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ResultExtractionError);
      expect((error as ResultExtractionError).cause).toBe(payload);
    }
  });
});

describe('methods/expectErr', () => {
  it('returns Err value and throws custom message for Ok', () => {
    expect(expectErr({ ok: false, error: 'boom' }, 'x')).toBe('boom');
    expect(() => expectErr({ ok: true, value: 1 }, 'custom')).toThrowError(
      'custom',
    );
  });

  it('preserves the Ok payload as the extraction error cause', () => {
    const payload = { id: '1' };

    try {
      expectErr({ ok: true, value: payload }, 'custom');
      throw new Error('Expected extraction to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ResultExtractionError);
      expect((error as ResultExtractionError).cause).toBe(payload);
    }
  });
});

describe('methods/unwrap', () => {
  it('returns Ok value and throws canonical message for Err', () => {
    expect(unwrap({ ok: true, value: 1 })).toBe(1);
    expect(() => unwrap({ ok: false, error: 'boom' })).toThrowError(
      'Called unwrap on an Err value',
    );
  });

  it('throws the stable extraction error with the Err payload as cause', () => {
    const payload = { code: 'E_FAIL' };

    expect.assertions(2);
    try {
      unwrap({ ok: false, error: payload });
    } catch (error) {
      expect(error).toBeInstanceOf(ResultExtractionError);
      expect((error as ResultExtractionError).cause).toBe(payload);
    }
  });
});

describe('methods/unwrapErr', () => {
  it('returns Err value and throws canonical message for Ok', () => {
    expect(unwrapErr({ ok: false, error: 'boom' })).toBe('boom');
    expect(() => unwrapErr({ ok: true, value: 1 })).toThrowError(
      'Called unwrapErr on an Ok value',
    );
  });

  it('throws the stable extraction error with the Ok payload as cause', () => {
    const payload = { id: '1' };

    expect.assertions(2);
    try {
      unwrapErr({ ok: true, value: payload });
    } catch (error) {
      expect(error).toBeInstanceOf(ResultExtractionError);
      expect((error as ResultExtractionError).cause).toBe(payload);
    }
  });
});

describe('methods/unwrapOr', () => {
  it('returns Ok value or provided default', () => {
    expect(unwrapOr({ ok: true, value: 1 }, 9)).toBe(1);
    expect(unwrapOr({ ok: false, error: 'boom' }, 9)).toBe(9);
  });
});

describe('methods/unwrapOrElse', () => {
  it('returns Ok value or computes fallback from Err', () => {
    expect(unwrapOrElse({ ok: true, value: 1 }, () => 9)).toBe(1);
    expect(unwrapOrElse({ ok: false, error: 'boom' }, (e) => e.length)).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';

import { Err } from '../../../src/constructors/Err.js';

describe('constructors/Err', () => {
  it('creates canonical Err result shape', () => {
    expect(Err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('preserves payload by reference when object error is provided', () => {
    const error = { code: 'E_FAIL' };
    const result = Err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it('shallow-freezes the wrapper without freezing the payload', () => {
    const error = { code: 'E_FAIL' };
    const result = Err(error);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(error)).toBe(false);
  });
});

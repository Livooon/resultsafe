import { describe, expect, it } from 'vitest';

import { Ok } from '../../../src/constructors/Ok.js';

describe('constructors/Ok', () => {
  it('creates canonical Ok result shape', () => {
    expect(Ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('preserves payload by reference when object value is provided', () => {
    const value = { id: '1' };
    const result = Ok(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(value);
    }
  });

  it('shallow-freezes the wrapper without freezing the payload', () => {
    const value = { id: '1' };
    const result = Ok(value);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
  });
});

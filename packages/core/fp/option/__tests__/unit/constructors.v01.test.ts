import { Some } from '@resultsafe/core-fp-option';
import { describe, expect, it } from 'vitest';

describe('Option constructors', () => {
  it('creates a shallow-frozen Some preserving payload identity', () => {
    const payload = { id: 1 };
    const some = Some(payload);

    expect(Object.isFrozen(some)).toBe(true);
    expect(some.value).toBe(payload);
    payload.id = 2;
    expect(some.value.id).toBe(2);
  });
});

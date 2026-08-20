import { describe, expect, it } from 'vitest';
import { Err, Failure, isFailure } from '../../../src/index.js';

describe('Failure', () => {
  it('creates a deeply frozen optional structured Err payload', () => {
    const source = { field: ['email'] };
    const value = Failure({
      schema_version: '1.0.0',
      code: 'urn:example:validation:invalid-field',
      details: source,
      causes: [{ schema_version: '1.0.0', code: 'urn:example:input:missing' }],
    });
    const result = Err(value);

    expect(result.error).toBe(value);
    expect(value.details).not.toBe(source);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.details)).toBe(true);
    expect(Object.isFrozen(value.causes)).toBe(true);
    expect(isFailure(value)).toBe(true);
  });

  it.each([
    [{ schema_version: '2.0.0', code: 'urn:example:error' }, 'schema_version'],
    [{ schema_version: '1.0.0', code: 'not-qualified' }, 'absolute URI'],
    [{ schema_version: '1.0.0', code: 'urn:example:error', extra: true }, 'unknown field'],
  ])('rejects malformed input %#', (input, message) => {
    expect(() => Failure(input as never)).toThrow(message);
    expect(isFailure(input)).toBe(false);
  });

  it('rejects cyclic cause graphs', () => {
    const cyclic: Record<string, unknown> = { schema_version: '1.0.0', code: 'urn:example:cycle' };
    cyclic['causes'] = [cyclic];
    expect(() => Failure(cyclic as never)).toThrow('cycles');
  });
});

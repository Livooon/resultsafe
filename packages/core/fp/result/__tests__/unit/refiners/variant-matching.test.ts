import { describe, expect, expectTypeOf, it } from 'vitest';

import { isTypedVariant } from '../../../src/refiners/isTypedVariant.js';
import { isTypedVariantOf } from '../../../src/refiners/isTypedVariantOf.js';
import { matchVariant } from '../../../src/refiners/matchVariant.js';
import { matchVariantStrict } from '../../../src/refiners/matchVariantStrict.js';

type Event =
  | { type: 'created'; id: string }
  | { type: 'failed'; reason: string };

describe('refiners/isTypedVariant', () => {
  it('accepts objects with matching type and rejects others', () => {
    const isCreated = isTypedVariant('created');

    expect(isCreated({ type: 'created', id: '1' })).toBe(true);
    expect(isCreated({ type: 'failed', reason: 'x' })).toBe(false);
    expect(isCreated({})).toBe(false);
    expect(isCreated(null)).toBe(false);
    expect(isCreated('created')).toBe(false);

    const inherited = Object.create({ type: 'created' });
    expect(isCreated(inherited)).toBe(false);
  });
});

describe('refiners/isTypedVariantOf', () => {
  it('validates explicit schema fields and returns false for invalid shapes', () => {
    const isCreated = isTypedVariantOf('created', {
      id: (value: unknown): value is string => typeof value === 'string',
    });

    expect(isCreated({ type: 'created', id: '1' })).toBe(true);
    expect(isCreated({ type: 'created', id: 1 })).toBe(false);
    expect(isCreated({ type: 'created' })).toBe(false);
    expect(isCreated({})).toBe(false);
    expect(isCreated({ type: 'failed', id: '1' })).toBe(false);
    expect(isCreated(undefined)).toBe(false);
  });

  it('requires own discriminator and payload fields', () => {
    const isCreated = isTypedVariantOf('created', { id: () => true });
    const inheritedType = Object.assign(Object.create({ type: 'created' }), {
      id: '1',
    });
    const inheritedId = Object.assign(Object.create({ id: '1' }), {
      type: 'created',
    });

    expect(isCreated(inheritedType)).toBe(false);
    expect(isCreated(inheritedId)).toBe(false);
  });

  it('propagates validator exceptions and infers predicate fields', () => {
    const failure = new Error('boom');
    const isCreated = isTypedVariantOf('created', {
      id: (value: unknown): value is string => {
        if (value === 'boom') throw failure;
        return typeof value === 'string';
      },
    });

    expect(() => isCreated({ type: 'created', id: 'boom' })).toThrow(failure);

    const candidate: unknown = { type: 'created', id: '1' };
    if (isCreated(candidate)) expectTypeOf(candidate.id).toEqualTypeOf<string>();
  });
});

describe('refiners/matchVariant', () => {
  it('runs matching handler and returns fallback for unknown path', () => {
    const created: Event = { type: 'created', id: '1' };
    const failed: Event = { type: 'failed', reason: 'boom' };

    const createdResult = matchVariant<Event>(created)
      .with('created', (v) => `ok:${v.id}`)
      .otherwise(() => 'fallback')
      .run();

    const fallbackResult = matchVariant<Event>(failed)
      .with('created', (v) => `ok:${v.id}`)
      .otherwise((v) => `fallback:${v.type}`)
      .run();

    expect(createdResult).toBe('ok:1');
    expect(fallbackResult).toBe('fallback:failed');
  });

  it('supports chained handlers and no-handler fallback path', () => {
    const failed: Event = { type: 'failed', reason: 'boom' };

    const chainedResult = matchVariant<Event>(failed)
      .with('created', (v) => `ok:${v.id}`)
      .with('failed', (v) => `err:${v.reason}`)
      .otherwise(() => 'fallback')
      .run();

    const noHandlerResult = matchVariant<Event>(failed)
      .otherwise((v) => `only-fallback:${v.type}`)
      .run();

    expect(chainedResult).toBe('err:boom');
    expect(noHandlerResult).toBe('only-fallback:failed');
  });

  it('preserves arbitrary handler chains and narrows fallback to remaining variants', () => {
    const failed: Event = { type: 'failed', reason: 'boom' };

    type ExtendedEvent =
      | Event
      | { type: 'deleted'; id: string }
      | { type: 'restored'; id: string };
    const restored: ExtendedEvent = { type: 'restored', id: '2' };

    const result = matchVariant<Event>(failed)
      .with('created', (v) => `ok:${v.id}`)
      .otherwise(() => 'nested-fallback')
      .run();
    const longResult = matchVariant<ExtendedEvent>(restored)
      .with('created', () => 1 as const)
      .with('failed', () => 2 as const)
      .with('deleted', () => 3 as const)
      .with('restored', () => 4 as const)
      .otherwise(() => 5 as const)
      .run();

    expect(result).toBe('nested-fallback');
    expect(longResult).toBe(4);
    expectTypeOf(longResult).toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
  });
});

describe('refiners/matchVariantStrict', () => {
  it('runs matching strict handler', () => {
    const value: Event = { type: 'created', id: '1' };
    const result = matchVariantStrict(value)
      .with('created', (v) => `ok:${v.id}`)
      .run();

    expect(result).toBe('ok:1');
  });

  it('throws when no handler matches', () => {
    const value: Event = { type: 'failed', reason: 'boom' };

    const incomplete = matchVariantStrict<Event>(value).with(
      'created',
      (v) => `ok:${v.id}`,
    ) as unknown as { run: () => unknown };
    expect(() => incomplete.run()).toThrowError('Unmatched variant: failed');
  });

  it('throws from root run when no handlers were registered', () => {
    const value: Event = { type: 'failed', reason: 'boom' };
    const strict = matchVariantStrict(value) as unknown as {
      run: () => unknown;
    };

    expect(() => strict.run()).toThrowError('Unmatched variant: failed');
  });

  it('preserves long chains and accumulates strict output types', () => {
    type ExtendedEvent =
      | Event
      | { type: 'deleted'; id: string }
      | { type: 'restored'; id: string };
    const value: ExtendedEvent = { type: 'created', id: '1' };
    const result = matchVariantStrict<ExtendedEvent>(value)
      .with('created', () => 1 as const)
      .with('failed', () => 'failed' as const)
      .with('deleted', () => true as const)
      .with('restored', () => null)
      .run();

    expect(result).toBe(1);
    expectTypeOf(result).toEqualTypeOf<1 | 'failed' | true | null>();
  });
});

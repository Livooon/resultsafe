import { describe, expect, it } from 'vitest';

import { refineAsyncResult } from '../../../src/refiners/refineAsyncResult.js';
import { refineAsyncResultU as refineAsyncResultUInline } from '../../../src/refiners/refineAsyncResult.js';
import { refineAsyncResultU } from '../../../src/refiners/refineAsyncResultU.js';
import { refineResult } from '../../../src/refiners/refineResult.js';
import { refineResultU as refineResultUInline } from '../../../src/refiners/refineResult.js';
import { refineResultU } from '../../../src/refiners/refineResultU.js';
import { refineVariantMap } from '../../../src/refiners/refineVariantMap.js';
import { getPayloadKeys } from '../../../src/refiners/utils/getPayloadKeys.js';
import * as refinerUtils from '../../../src/refiners/utils/index.js';

const variantMap = {
  created: { payload: ['id', 'meta'] },
  deleted: { payload: 'id' },
  ping: { payload: [] },
  legacyPing: { payload: 'never' },
} as const;

describe('refiners/getPayloadKeys', () => {
  it('normalizes payload config into array form', () => {
    expect(getPayloadKeys({ payload: 'never' })).toEqual([]);
    expect(getPayloadKeys({ payload: 'id' })).toEqual(['id']);
    expect(getPayloadKeys({ payload: ['id', 'meta'] })).toEqual(['id', 'meta']);
    expect(getPayloadKeys({ payload: [] })).toEqual([]);
    expect(typeof refinerUtils.getPayloadKeys).toBe('function');
  });
});

describe('refiners/refineResult', () => {
  it('returns null for invalid input shapes and non-matching variants', () => {
    const refineCreated = refineResult(variantMap)('created')({});
    expect(refineCreated(null)).toBeNull();
    expect(refineCreated({})).toBeNull();
    expect(refineCreated({ type: 'deleted', id: '1' })).toBeNull();
  });

  it('applies validators for configured payload keys', () => {
    const refineCreated = refineResult(variantMap)('created')({
      id: (v: unknown): v is string => typeof v === 'string' && v.length > 0,
      meta: (v: unknown): v is number => typeof v === 'number',
    });

    expect(refineCreated({ type: 'created', id: '1', meta: 10 })).toEqual({
      type: 'created',
      id: '1',
      meta: 10,
    });
    expect(refineCreated({ type: 'created', id: '', meta: 10 })).toBeNull();
    expect(refineCreated({ type: 'created', id: '1', meta: 'bad' })).toBeNull();
  });

  it('returns value for canonical empty payload and legacy never variants', () => {
    const refinePing = refineResult(variantMap)('ping')({});
    expect(refinePing({ type: 'ping' })).toEqual({ type: 'ping' });
    const refineLegacyPing = refineResult(variantMap)('legacyPing')({});
    expect(refineLegacyPing({ type: 'legacyPing' })).toEqual({
      type: 'legacyPing',
    });
  });

  it('enforces own payload, strict fields, forbidden fields, and callable validators', () => {
    const map = {
      created: {
        payload: ['id', 'meta'],
        strictFields: true,
        forbidden: ['secret'],
      },
    } as const;
    const refineCreated = refineResult(map)('created')({});
    const inherited = Object.assign(Object.create({ id: '1' }), {
      type: 'created',
      meta: 1,
    });

    expect(refineCreated({ type: 'created', meta: 1 })).toBeNull();
    expect(refineCreated(inherited)).toBeNull();
    expect(
      refineCreated({ type: 'created', id: '1', meta: 1, extra: true }),
    ).toBeNull();
    expect(
      refineCreated({ type: 'created', id: '1', meta: 1, secret: undefined }),
    ).toBeNull();
    expect(
      refineResult(map)('created')({ id: 1 } as never)({
        type: 'created',
        id: '1',
        meta: 1,
      }),
    ).toBeNull();
  });

  it('covers missing validator branch and missing config at runtime', () => {
    const refineDeletedWithoutValidators = refineResult(variantMap)('deleted')(
      {},
    );
    expect(
      refineDeletedWithoutValidators({ type: 'deleted', id: '1' }),
    ).toEqual({
      type: 'deleted',
      id: '1',
    });

    const brokenMap = { deleted: undefined } as unknown as typeof variantMap;
    const refineBroken = refineResult(brokenMap)('deleted')({});
    expect(refineBroken({ type: 'deleted', id: '1' })).toBeNull();
  });
});

describe('refiners/refineResultU', () => {
  it('delegates to refineResult and returns identical behavior', () => {
    const result = refineResultU(
      { type: 'deleted', id: '1' },
      'deleted',
      variantMap,
      { id: (v: unknown): v is string => typeof v === 'string' },
    );

    expect(result).toEqual({ type: 'deleted', id: '1' });
  });

  it('covers inline refineResultU export from refineResult.ts', () => {
    const result = refineResultUInline(
      { type: 'deleted', id: '1' },
      'deleted',
      variantMap,
      { id: (v: unknown): v is string => typeof v === 'string' },
    );

    expect(result).toEqual({ type: 'deleted', id: '1' });
  });
});

describe('refiners/refineAsyncResult', () => {
  it('validates asynchronously and returns null on failed checks', async () => {
    const refineCreated = refineAsyncResult(variantMap)('created')({
      id: (v) => Promise.resolve(typeof v === 'string' && v.length > 0),
      meta: (v) => Promise.resolve(typeof v === 'number'),
    });

    await expect(
      refineCreated({ type: 'created', id: '1', meta: 42 }),
    ).resolves.toEqual({ type: 'created', id: '1', meta: 42 });
    await expect(
      refineCreated({ type: 'created', id: '', meta: 42 }),
    ).resolves.toBeNull();
    await expect(
      refineCreated({ type: 'created', id: '1', meta: 'bad' }),
    ).resolves.toBeNull();
  });

  it('runs validators sequentially, short-circuits, and preserves rejection identity', async () => {
    const map = {
      created: { payload: ['id', 'meta'] },
    } as const;
    const order: string[] = [];
    const refineCreated = refineAsyncResult(map)('created')({
      id: async () => {
        order.push('id:start');
        await Promise.resolve();
        order.push('id:end');
        return true;
      },
      meta: async () => {
        order.push('meta');
        return false;
      },
    });

    await expect(
      refineCreated({ type: 'created', id: '1', meta: 1 }),
    ).resolves.toBeNull();
    expect(order).toEqual(['id:start', 'id:end', 'meta']);

    const failure = new Error('boom');
    const rejecting = refineAsyncResult(map)('created')({
      id: async () => Promise.reject(failure),
    });
    await expect(
      rejecting({ type: 'created', id: '1', meta: 1 }),
    ).rejects.toBe(failure);
  });

  it('returns null for wrong type and non-objects', async () => {
    const refineDeleted = refineAsyncResult(variantMap)('deleted')({});
    await expect(refineDeleted(undefined)).resolves.toBeNull();
    await expect(refineDeleted({ id: '1' })).resolves.toBeNull();
    await expect(
      refineDeleted({ type: 'created', id: '1' }),
    ).resolves.toBeNull();
  });

  it('handles missing validators, payload=never, and missing config at runtime', async () => {
    const refineDeletedNoValidators = refineAsyncResult(variantMap)('deleted')(
      {},
    );
    await expect(
      refineDeletedNoValidators({ type: 'deleted', id: '1' }),
    ).resolves.toEqual({ type: 'deleted', id: '1' });

    const refinePing = refineAsyncResult(variantMap)('ping')({});
    await expect(refinePing({ type: 'ping' })).resolves.toEqual({
      type: 'ping',
    });

    const brokenMap = { created: undefined } as unknown as typeof variantMap;
    const refineBroken = refineAsyncResult(brokenMap)('created')({});
    await expect(refineBroken({ type: 'created' })).resolves.toBeNull();
  });
});

describe('refiners/refineAsyncResultU', () => {
  it('delegates to async refiner and validates value', async () => {
    const result = await refineAsyncResultU(
      { type: 'deleted', id: '1' },
      'deleted',
      variantMap,
      { id: (v) => Promise.resolve(typeof v === 'string') },
    );

    expect(result).toEqual({ type: 'deleted', id: '1' });
  });

  it('covers inline refineAsyncResultU export from refineAsyncResult.ts', async () => {
    const result = await refineAsyncResultUInline(
      { type: 'deleted', id: '1' },
      'deleted',
      variantMap,
      { id: (v) => Promise.resolve(typeof v === 'string') },
    );

    expect(result).toEqual({ type: 'deleted', id: '1' });
  });

  it('returns null for invalid async-result-u inputs and supports payload=never', async () => {
    await expect(
      refineAsyncResultU(undefined, 'deleted', variantMap, {}),
    ).resolves.toBeNull();

    await expect(
      refineAsyncResultU({ type: 'ping' }, 'ping', variantMap, {}),
    ).resolves.toEqual({ type: 'ping' });
  });

  it('covers object-shape guards and validator loop branches', async () => {
    await expect(
      refineAsyncResultU({ id: '1' }, 'deleted', variantMap, {}),
    ).resolves.toBeNull();

    await expect(
      refineAsyncResultU(
        { type: 'created', id: '1', meta: 2 },
        'created',
        variantMap,
        {},
      ),
    ).resolves.toEqual({ type: 'created', id: '1', meta: 2 });

    const brokenMap = { created: undefined } as unknown as typeof variantMap;
    await expect(
      refineAsyncResultU({ type: 'created' }, 'created', brokenMap, {}),
    ).resolves.toBeNull();
  });

  it('covers type-mismatch and async validator-failure branches', async () => {
    await expect(
      refineAsyncResultU(
        { type: 'created', id: '1' },
        'deleted',
        variantMap,
        {},
      ),
    ).resolves.toBeNull();

    await expect(
      refineAsyncResultU({ type: 'deleted', id: '1' }, 'deleted', variantMap, {
        id: () => Promise.resolve(false),
      }),
    ).resolves.toBeNull();
  });
});

describe('refiners/refineVariantMap', () => {
  it('returns null for invalid inputs and unknown variants', () => {
    expect(refineVariantMap(null, variantMap, {})).toBeNull();
    expect(refineVariantMap({ type: 'unknown' }, variantMap, {})).toBeNull();
  });

  it('validates payload keys using per-variant validator map', () => {
    const validators = {
      created: {
        id: (v: unknown): v is string => typeof v === 'string',
        meta: (v: unknown): v is number => typeof v === 'number',
      },
      deleted: {
        id: (v: unknown): v is string => typeof v === 'string',
      },
      ping: {},
      legacyPing: {},
    };

    expect(
      refineVariantMap(
        { type: 'created', id: '1', meta: 42 },
        variantMap,
        validators,
      ),
    ).toEqual({ type: 'created', id: '1', meta: 42 });
    expect(
      refineVariantMap(
        { type: 'created', id: '1', meta: 'bad' },
        variantMap,
        validators,
      ),
    ).toBeNull();
    expect(refineVariantMap({ type: 'ping' }, variantMap, validators)).toEqual({
      type: 'ping',
    });
    expect(
      refineVariantMap({ type: 'deleted', id: '2' }, variantMap, validators),
    ).toEqual({ type: 'deleted', id: '2' });
  });

  it('returns null when selected config is missing at runtime', () => {
    const brokenMap = { broken: undefined } as unknown as typeof variantMap;
    expect(
      refineVariantMap({ type: 'broken' }, brokenMap, {} as never),
    ).toBeNull();
  });

  it('covers missing-check branch in per-key validator loop', () => {
    const validators = {
      created: {},
      deleted: {},
      ping: {},
      legacyPing: {},
    };

    expect(
      refineVariantMap({ type: 'deleted', id: '1' }, variantMap, validators),
    ).toEqual({
      type: 'deleted',
      id: '1',
    });
  });

  it('rejects inherited map/configuration members and missing payload', () => {
    const inheritedMap = Object.create({
      deleted: { payload: 'id' },
    }) as typeof variantMap;
    expect(
      refineVariantMap({ type: 'deleted', id: '1' }, inheritedMap, {}),
    ).toBeNull();
    expect(refineVariantMap({ type: 'deleted' }, variantMap, {})).toBeNull();
  });
});

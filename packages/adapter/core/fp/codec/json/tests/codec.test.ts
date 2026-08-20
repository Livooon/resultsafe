import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CauseEmpty,
  CauseFail,
  CauseParallel,
  CauseSequential,
  ExitFailure,
  Failure,
  type Cause,
} from '@resultsafe/core-fp-result';
import { describe, expect, it } from 'vitest';

import { decodeCause, decodeExit, decodeFailure, encodeCause, encodeExit, encodeFailure, type PayloadCodec } from '../src/index.js';

const identityCodec: PayloadCodec<unknown> = {
  encode: (value) => value,
  decode: (value) => value,
};
const vectors = JSON.parse(readFileSync(fileURLToPath(new URL('../vectors/codec.json', import.meta.url)), 'utf8')) as {
  valid: { name: string; kind: 'cause' | 'exit'; wire: unknown }[];
  malformed: { name: string; kind: 'cause' | 'exit'; wire: unknown }[];
};

describe('shared golden vectors', () => {
  for (const vector of vectors.valid) {
    it(vector.name, () => {
      const encoded = vector.kind === 'cause'
        ? encodeCause(decodeCause(vector.wire, identityCodec), identityCodec)
        : encodeExit(decodeExit(vector.wire, identityCodec, identityCodec), identityCodec, identityCodec);
      expect(encoded).toEqual(vector.wire);
      expect(JSON.stringify(encoded)).not.toContain('_tag');
    });
  }

  for (const vector of vectors.malformed) {
    it(`rejects ${vector.name}`, () => {
      expect(() => vector.kind === 'cause'
        ? decodeCause(vector.wire, identityCodec)
        : decodeExit(vector.wire, identityCodec, identityCodec)).toThrow();
    });
  }
});

it('preserves grouping and order and returns frozen core nodes', () => {
  const decoded = decodeCause({ tag: 'Sequential', left: { tag: 'Fail', error: 'a' }, right: { tag: 'Parallel', left: { tag: 'Empty' }, right: { tag: 'Fail', error: 'b' } } }, identityCodec);
  expect(decoded).toEqual(CauseSequential(CauseFail('a'), CauseParallel(CauseEmpty(), CauseFail('b'))));
  expect(Object.isFrozen(decoded)).toBe(true);
  expect(Object.isFrozen((decoded as { left: object }).left)).toBe(true);
});

it('preserves Failure omission and codec-defined payload semantics', () => {
  const failure = Failure({ schema_version: '1.0.0', code: 'urn:example:omitted' });
  expect(encodeFailure(decodeFailure(encodeFailure(failure)))).toEqual({ schema_version: '1.0.0', code: 'urn:example:omitted' });

  const numberCodec: PayloadCodec<number> = {
    encode: (value) => String(value),
    decode: (value) => Number(value),
  };
  expect(encodeCause(CauseFail(7), numberCodec)).toEqual({ tag: 'Fail', error: '7' });
  expect(decodeCause({ tag: 'Fail', error: '8' }, numberCodec)).toEqual(CauseFail(8));
});

it('encodes shared nodes by occurrence and rejects cycles', () => {
  const shared = CauseFail('error');
  const wire = encodeCause(CauseParallel(shared, shared), identityCodec) as { left: object; right: object };
  expect(wire.left).toEqual(wire.right);
  expect(wire.left).not.toBe(wire.right);

  const cyclic = { _tag: 'Sequential' } as unknown as { _tag: 'Sequential'; left: Cause<unknown>; right: Cause<unknown> };
  cyclic.left = CauseEmpty();
  cyclic.right = cyclic;
  expect(() => encodeCause(cyclic, identityCodec)).toThrow(/cycles/);
  const cyclicWire: Record<string, unknown> = { tag: 'Sequential', left: { tag: 'Empty' } };
  cyclicWire['right'] = cyclicWire;
  expect(() => decodeCause(cyclicWire, identityCodec)).toThrow(/cycles/);
});

it('enforces depth and node limits from document root zero', () => {
  let deep: unknown = { tag: 'Empty' };
  for (let index = 0; index < 33; index += 1) deep = { tag: 'Sequential', left: { tag: 'Empty' }, right: deep };
  expect(() => decodeCause(deep, identityCodec)).toThrow(/max_depth 32/);

  let broad: Cause<unknown> = CauseFail('error');
  for (let index = 0; index < 10; index += 1) broad = CauseParallel(broad, broad);
  expect(() => encodeCause(broad, identityCodec)).toThrow(/max_nodes 1024/);
  expect(() => encodeExit(ExitFailure(CauseEmpty()), identityCodec, identityCodec)).not.toThrow();
});

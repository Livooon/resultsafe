import { isTypedVariantOf } from '../../src/refiners/isTypedVariantOf.js';
import { matchVariant } from '../../src/refiners/matchVariant.js';
import { matchVariantStrict } from '../../src/refiners/matchVariantStrict.js';
import { refineAsyncResult } from '../../src/refiners/refineAsyncResult.js';
import { refineResult } from '../../src/refiners/refineResult.js';
import type { SyncRefinedResult } from '../../src/refiners/types/SyncRefinedResult.js';
import type { VariantOf } from '../../src/refiners/types/VariantOf.js';
import type { AsyncValidatorFn } from '../../src/types/refiners/AsyncValidatorFn.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

type Distributed = VariantOf<'a' | 'b'>;
type _Distributed = Assert<
  Equal<Distributed, { type: 'a' } | { type: 'b' }>
>;

const guard = isTypedVariantOf('a', {
  id: (value: unknown): value is string => typeof value === 'string',
  count: (value: unknown): value is number => typeof value === 'number',
});
declare const candidate: unknown;
if (guard(candidate)) {
  const id: string = candidate.id;
  const count: number = candidate.count;
  void [id, count];
}

const map = {
  a: { payload: ['id', 'count'] },
  empty: { payload: [] },
  legacyEmpty: { payload: 'never' },
} as const;
const refined = refineResult(map)('a')({
  id: (value: unknown): value is string => typeof value === 'string',
});
const refinedValue = refined({ type: 'a', id: 'x', count: 1 });
if (refinedValue) {
  const id: string = refinedValue.id;
  const count: unknown = refinedValue.count;
  void [id, count];
}

type Refined = SyncRefinedResult<
  'a',
  typeof map,
  { id: (value: unknown) => value is string }
>;
type _RefinedId = Assert<Equal<Refined['id'], string>>;
type _RefinedCount = Assert<Equal<Refined['count'], unknown>>;

type Event =
  | { type: 'a'; value: number }
  | { type: 'b'; value: string }
  | { type: 'c'; value: boolean };
declare const event: Event;

const fallbackOutput = matchVariant(event)
  .with('a', () => 1 as const)
  .with('b', () => 'b' as const)
  .otherwise((remaining) => {
    const exact: { type: 'c'; value: boolean } = remaining;
    return exact.value;
  })
  .run();
type _FallbackOutput = Assert<Equal<typeof fallbackOutput, 1 | 'b' | boolean>>;

const partial = matchVariant(event).with('a', () => 1);
// @ts-expect-error duplicate variants are excluded
partial.with('a', () => 2);

const strictPartial = matchVariantStrict(event).with('a', () => 1 as const);
// @ts-expect-error strict run is unavailable before exhaustion
strictPartial.run();

const strictOutput = strictPartial
  .with('b', () => 'b' as const)
  .with('c', () => true as const)
  .run();
type _StrictOutput = Assert<Equal<typeof strictOutput, 1 | 'b' | true>>;

const isStringAsync: AsyncValidatorFn<string> = async (value) =>
  typeof value === 'string';
const asyncRefined = refineAsyncResult(map)('a')({
  id: isStringAsync,
});
const asyncOutput = await asyncRefined({ type: 'a', id: 'x', count: 1 });
if (asyncOutput) {
  const id: string = asyncOutput.id;
  const count: unknown = asyncOutput.count;
  void [id, count];
}

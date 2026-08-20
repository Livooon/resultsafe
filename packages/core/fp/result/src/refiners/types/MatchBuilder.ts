import type { VariantOf } from './VariantOf.js';

/**
 * Describes the shape of a strict builder for variant matching.
 *
 * @typeParam T - The variant union type.
 * @typeParam R - The return type of the match operation.
 * @typeParam Remaining - The union members not yet handled.
 *
 * @example
 * ```ts
 * import { MatchBuilder } from '@resultsafe/core-fp-result';
 *
 * const builder: MatchBuilder<MyVariant, string> = {
 *   with: (variant, fn) => builder,
 *   run: () => 'result'
 * };
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type MatchBuilder<
  T extends VariantOf,
  R = never,
  Remaining extends T = T,
> = {
  readonly with: <K extends Remaining['type'], U>(
    variant: K,
    fn: (value: Extract<Remaining, { type: K }>) => U,
  ) => MatchBuilder<T, R | U, Exclude<Remaining, { type: K }>>;
  readonly run: [Remaining] extends [never] ? () => R : never;
};

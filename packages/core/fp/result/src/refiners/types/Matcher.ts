import type { VariantOf } from './VariantOf.js';

/**
 * Describes the shape of a non-strict builder for variant matching.
 *
 * @typeParam T - The variant union type.
 * @typeParam R - The return type of the match operation.
 *
 * @remarks
 * Unlike {@link MatchBuilder}, this builder allows matching any variant
 * and provides an `otherwise` fallback handler for unmatched cases.
 *
 * @example
 * ```ts
 * import { Matcher } from '@resultsafe/core-fp-result';
 *
 * const matcher: Matcher<MyVariant, string> = {
 *   with: (variant, fn) => matcher,
 *   otherwise: (fn) => ({ run: () => 'default' })
 * };
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type Matcher<T extends VariantOf, R = never, Remaining extends T = T> = {
  readonly with: <K extends Remaining['type'], U>(
    variant: K,
    fn: (value: Extract<Remaining, { type: K }>) => U,
  ) => Matcher<T, R | U, Exclude<Remaining, { type: K }>>;
  readonly otherwise: <U>(fn: (value: Remaining) => U) => {
    readonly run: () => R | U;
  };
};

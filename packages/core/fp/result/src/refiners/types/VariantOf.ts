/**
 * Describes the minimal contract for a discriminated union variant.
 *
 * @typeParam K - The variant key type. Defaults to `string`.
 *
 * @remarks
 * This type is used as a constraint for variant unions. Each variant
 * must have a `type` field that serves as the discriminator.
 *
 * @example
 * ```ts
 * import { VariantOf } from '@resultsafe/core-fp-result';
 *
 * type MyVariant = VariantOf<'user' | 'error'>;
 * // { type: 'user' } | { type: 'error' }
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type VariantOf<K extends string = string> = K extends string
  ? { type: K }
  : never;

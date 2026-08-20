import type { PayloadKeys } from '../../types/refiners/PayloadKeys.js';
import type { ValidatorFn } from '../../types/refiners/ValidatorFn.js';
import type { VariantConfig } from '../../types/refiners/VariantConfig.js';

/**
 * Describes a generalized synchronously refined variant value.
 *
 * @typeParam K - The variant key type.
 * @typeParam TMap - The variant configuration map.
 * @typeParam _TValidators - The validator map for the variant.
 *
 * @remarks
 * This type represents a variant refined through sync validation.
 * The `type` field discriminates the variant, and additional fields
 * are validated synchronously.
 *
 * @example
 * ```ts
 * import { UniversalRefinedResult, VariantConfig } from '@resultsafe/core-fp-result';
 *
 * type SyncVariant = UniversalRefinedResult<
 *   'user',
 *   { user: { payload: 'name' } },
 *   {}
 * >;
 * // { type: 'user'; [key: string]: unknown }
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type UniversalRefinedResult<
  K extends keyof TMap & string,
  TMap extends Record<string, VariantConfig>,
  TValidators extends Partial<Record<PayloadKeys<TMap[K]>, ValidatorFn>>,
> = {
  type: K;
} & {
  [P in PayloadKeys<TMap[K]>]: P extends keyof TValidators
    ? TValidators[P] extends (value: unknown) => value is infer T
      ? T
      : unknown
    : unknown;
};

import type { AsyncValidatorFn } from '../../types/refiners/AsyncValidatorFn.js';
import type { PayloadKeys } from '../../types/refiners/PayloadKeys.js';
import type { VariantConfig } from '../../types/refiners/VariantConfig.js';

/**
 * Describes a generalized asynchronously refined variant value.
 *
 * @typeParam K - The variant key type.
 * @typeParam TMap - The variant configuration map.
 * @typeParam _TValidators - The validator map for the variant.
 *
 * @remarks
 * This type represents a variant refined through async validation.
 * The `type` field discriminates the variant, and additional fields
 * are validated asynchronously.
 *
 * @example
 * ```ts
 * import { UniversalAsyncRefinedResult, VariantConfig } from '@resultsafe/core-fp-result';
 *
 * type AsyncVariant = UniversalAsyncRefinedResult<
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
export type UniversalAsyncRefinedResult<
  K extends keyof TMap & string,
  TMap extends Record<string, VariantConfig>,
  TValidators extends Partial<Record<PayloadKeys<TMap[K]>, AsyncValidatorFn>>,
> = {
  type: K;
} & {
  [P in PayloadKeys<TMap[K]>]: P extends keyof TValidators
    ? TValidators[P] extends AsyncValidatorFn<infer T>
      ? T
      : unknown
    : unknown;
};

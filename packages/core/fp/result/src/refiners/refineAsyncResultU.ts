import type { AsyncValidatorFn } from '../types/refiners/AsyncValidatorFn.js';
import type { PayloadKeys } from '../types/refiners/PayloadKeys.js';
import type { VariantConfig } from '../types/refiners/VariantConfig.js';
import type { UniversalAsyncRefinedResult } from './types/index.js';
import { validateAsync } from './validationKernels.js';

/**
 * Refines a value asynchronously in non-curried call style.
 *
 * @typeParam TMap - The variant configuration map type.
 * @typeParam K - The target variant key.
 * @typeParam TValidators - The async validator map for payload fields.
 * @param value - The value to validate and refine.
 * @param variant - The target variant key.
 * @param variantMap - The variant configuration map.
 * @param validators - The async payload validators.
 * @returns A promise resolving to the refined value or `null`.
 * @since 0.1.0
 * @see {@link refineAsyncResult} - Curry-style async refiner constructor.
 * @example
 * ```ts
 * import { refineAsyncResultU } from '@resultsafe/core-fp-result';
 *
 * const map = { ok: { payload: 'value' } } as const;
 * const out = await refineAsyncResultU({ type: 'ok', value: 1 }, 'ok', map, {
 *   value: async (x: unknown) => typeof x === 'number',
 * });
 *
 * console.log(out?.type); // ok
 * ```
 * @public
 */
export const refineAsyncResultU = <
  TMap extends Record<string, VariantConfig>,
  K extends keyof TMap & string,
  TValidators extends Partial<Record<PayloadKeys<TMap[K]>, AsyncValidatorFn>>,
>(
  value: unknown,
  variant: K,
  variantMap: TMap,
  validators: TValidators,
): Promise<UniversalAsyncRefinedResult<K, TMap, TValidators> | null> => {
  return validateAsync(
    value,
    variant,
    variantMap,
    validators,
  ) as Promise<UniversalAsyncRefinedResult<K, TMap, TValidators> | null>;
};

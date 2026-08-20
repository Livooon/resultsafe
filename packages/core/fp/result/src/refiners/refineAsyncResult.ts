import type { AsyncValidatorFn } from '../types/refiners/AsyncValidatorFn.js';
import type { PayloadKeys } from '../types/refiners/PayloadKeys.js';
import type { VariantConfig } from '../types/refiners/VariantConfig.js';
import type { UniversalAsyncRefinedResult } from './types/index.js';
import { validateAsync } from './validationKernels.js';

/**
 * Creates an async variant refiner with async payload validators.
 *
 * @typeParam TMap - The variant configuration map type.
 * @param variantMap - The map describing valid variants and payload fields.
 * @returns A curried async refiner factory bound to `variantMap`.
 * @since 0.1.0
 * @see {@link refineAsyncResultU} - Direct (non-curried) helper variant.
 * @example
 * ```ts
 * import { refineAsyncResult } from '@resultsafe/core-fp-result';
 *
 * const map = { ok: { payload: 'value' } } as const;
 * const refineOk = refineAsyncResult(map)('ok')({
 *   value: async (x: unknown) => typeof x === 'number',
 * });
 *
 * console.log(await refineOk({ type: 'ok', value: 1 })); // { type: 'ok', value: 1 }
 * ```
 * @public
 */
export const refineAsyncResult =
  <TMap extends Record<string, VariantConfig>>(variantMap: TMap) =>
  <K extends keyof TMap & string>(variant: K) =>
  <TValidators extends Partial<Record<PayloadKeys<TMap[K]>, AsyncValidatorFn>>>(
    validators: TValidators,
  ) =>
  async (
    value: unknown,
  ): Promise<UniversalAsyncRefinedResult<K, TMap, TValidators> | null> => {
    const result = await validateAsync(value, variant, variantMap, validators);
    return result as UniversalAsyncRefinedResult<K, TMap, TValidators> | null;
  };

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
 * @remarks
 * This export is kept for compatibility. Prefer {@link refineAsyncResultU}
 * from `refineAsyncResultU.ts` as the canonical non-curried entry point.
 * @since 0.1.0
 * @example
 * ```ts
 * import { refineAsyncResultU } from '@resultsafe/core-fp-result/src/refiners/refineAsyncResult.js';
 *
 * const map = { ok: { payload: 'value' } } as const;
 * const out = await refineAsyncResultU({ type: 'ok', value: 1 }, 'ok', map, {
 *   value: async (x: unknown) => typeof x === 'number',
 * });
 *
 * console.log(out?.type); // ok
 * ```
 * @internal
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
): Promise<UniversalAsyncRefinedResult<K, TMap, TValidators> | null> =>
  refineAsyncResult(variantMap)(variant)(validators)(value);

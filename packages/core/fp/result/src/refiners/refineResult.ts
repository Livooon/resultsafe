import type { PayloadKeys } from '../types/refiners/PayloadKeys.js';
import type { ValidatorFn } from '../types/refiners/ValidatorFn.js';
import type { VariantConfig } from '../types/refiners/VariantConfig.js';
import type { UniversalRefinedResult } from './types/index.js';
import { validateSync } from './validationKernels.js';

/**
 * Creates a sync variant refiner with payload validators.
 *
 * @typeParam TMap - The variant configuration map type.
 * @param variantMap - The map describing valid variants and payload fields.
 * @returns A curried refiner factory bound to `variantMap`.
 * @since 0.1.0
 * @see {@link refineResultU} - Direct (non-curried) helper variant.
 * @example
 * ```ts
 * import { refineResult } from '@resultsafe/core-fp-result';
 *
 * const map = { ok: { payload: 'value' } } as const;
 * const refineOk = refineResult(map)('ok')({
 *   value: (x: unknown): x is number => typeof x === 'number',
 * });
 *
 * console.log(refineOk({ type: 'ok', value: 1 })); // { type: 'ok', value: 1 }
 * ```
 * @public
 */
export const refineResult =
  <TMap extends Record<string, VariantConfig>>(variantMap: TMap) =>
  <K extends keyof TMap & string>(variant: K) =>
  <TValidators extends Partial<Record<PayloadKeys<TMap[K]>, ValidatorFn>>>(
    validators: TValidators,
  ) =>
  (value: unknown): UniversalRefinedResult<K, TMap, TValidators> | null => {
    const result = validateSync(value, variant, variantMap, validators);
    return result as UniversalRefinedResult<K, TMap, TValidators> | null;
  };

/**
 * Refines a value by variant map in non-curried call style.
 *
 * @typeParam TMap - The variant configuration map type.
 * @typeParam K - The target variant key.
 * @typeParam TValidators - The validator map for payload fields.
 * @param value - The value to validate and refine.
 * @param variant - The target variant key.
 * @param variantMap - The variant configuration map.
 * @param validators - The payload validators for the target variant.
 * @returns The refined value or `null`.
 * @remarks
 * This export is kept for compatibility. Prefer {@link refineResultU} from
 * `refineResultU.ts` as the canonical non-curried entry point.
 * @since 0.1.0
 * @example
 * ```ts
 * import { refineResultU } from '@resultsafe/core-fp-result/src/refiners/refineResult.js';
 *
 * const map = { ok: { payload: 'value' } } as const;
 * const out = refineResultU({ type: 'ok', value: 1 }, 'ok', map, {
 *   value: (x: unknown): x is number => typeof x === 'number',
 * });
 *
 * console.log(out?.type); // ok
 * ```
 * @internal
 */
export const refineResultU = <
  TMap extends Record<string, VariantConfig>,
  K extends keyof TMap & string,
  TValidators extends Partial<Record<PayloadKeys<TMap[K]>, ValidatorFn>>,
>(
  value: unknown,
  variant: K,
  variantMap: TMap,
  validators: TValidators,
): UniversalRefinedResult<K, TMap, TValidators> | null =>
  refineResult(variantMap)(variant)(validators)(value);

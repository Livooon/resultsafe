import type { PayloadKeys } from '../../types/refiners/PayloadKeys.js';
import type { VariantConfig } from '../../types/refiners/VariantConfig.js';

/**
 * Normalizes a variant payload configuration into a list of keys.
 *
 * @typeParam C - The variant configuration type.
 * @param config - The variant configuration with payload definition.
 * @returns The payload keys as a readonly array.
 * @since 0.1.0
 * @example
 * ```ts
 * import { getPayloadKeys } from '@resultsafe/core-fp-result/src/refiners/utils/getPayloadKeys.js';
 *
 * const keys = getPayloadKeys({ payload: ['id', 'meta'] } as const);
 * console.log(keys.length); // 2
 * ```
 * @internal
 */
export const getPayloadKeys = <C extends VariantConfig>(
  config: C,
): readonly PayloadKeys<C>[] => {
  const p = config.payload;
  // `never` was the pre-0.3 empty-payload sentinel. Keep accepting persisted
  // or untyped configuration while [] is the canonical typed representation.
  if (p === 'never') return [];
  return (Array.isArray(p) ? p : [p]) as readonly PayloadKeys<C>[];
};

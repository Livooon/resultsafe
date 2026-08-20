import type { VariantConfig } from './VariantConfig.js';

/**
 * Extracts the payload keys from a `VariantConfig`.
 *
 * @typeParam T - The `VariantConfig` type to extract keys from.
 * @returns The union of payload keys, or `never` for an empty key list.
 *
 * @example
 * ```ts
 * import { PayloadKeys, VariantConfig } from '@resultsafe/core-fp-result';
 *
 * type Config = { payload: 'name' | 'age'; forbidden?: string };
 * type Keys = PayloadKeys<Config>; // 'name' | 'age'
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type PayloadKeys<T extends VariantConfig> = T['payload'] extends 'never'
  ? never
  : T['payload'] extends string
    ? T['payload']
    : T['payload'] extends readonly string[]
      ? T['payload'][number]
      : never;

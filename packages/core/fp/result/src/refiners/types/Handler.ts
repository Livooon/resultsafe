import type { VariantOf } from './VariantOf.js';

/**
 * Describes a handler entry for variant matching in internal matcher mechanisms.
 *
 * @typeParam K - The variant key type.
 * @typeParam T - The variant union type.
 * @typeParam R - The return type of the handler function.
 *
 * @public
 */
export type Handler<K extends T['type'], T extends VariantOf, R> = {
  readonly variant: K;
  readonly fn: (value: Extract<T, { type: K }>) => R;
};

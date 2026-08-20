/**
 * Creates a runtime type guard for a discriminated union variant.
 *
 * @typeParam K - The discriminant literal type.
 * @param variant - The discriminant value to match.
 * @returns A predicate that checks `{ type: K }` shape.
 * @since 0.1.0
 * @see {@link isTypedVariantOf} - Extends check with payload keys.
 * @example
 * ```ts
 * import { isTypedVariant } from '@resultsafe/core-fp-result';
 *
 * const isCreated = isTypedVariant('created');
 * console.log(isCreated({ type: 'created' })); // true
 * ```
 * @public
 */
export const isTypedVariant =
  <K extends string>(variant: K) =>
  (value: unknown): value is { type: K } => {
    if (typeof value !== 'object' || value === null) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;

    const obj = value as Record<string, unknown>;
    return obj['type'] === variant;
  };

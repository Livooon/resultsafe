/**
 * Creates a runtime type guard for a variant with additional payload keys.
 *
 * @typeParam K - The discriminant literal type.
 * @typeParam TValidators - The runtime validator schema.
 * @param variant - The discriminant value to match.
 * @param validators - Validators for every required payload field.
 * @returns A predicate that checks own fields and validates their values.
 * @since 0.1.0
 * @see {@link isTypedVariant} - Checks only the discriminant.
 * @example
 * ```ts
 * import { isTypedVariantOf } from '@resultsafe/core-fp-result';
 *
 * const isCreated = isTypedVariantOf('created', {
 *   id: (value: unknown): value is string => typeof value === 'string',
 * });
 * console.log(isCreated({ type: 'created', id: 1 })); // true
 * ```
 * @public
 */
export const isTypedVariantOf =
  <
    K extends string,
    TValidators extends Record<string, (value: unknown) => boolean>,
  >(
    variant: K,
    validators: TValidators,
  ) =>
  (
    value: unknown,
  ): value is { type: K } & {
    [P in Extract<keyof TValidators, string>]: TValidators[P] extends (
      value: unknown,
    ) => value is infer T
      ? T
      : unknown;
  } => {
    if (typeof validators !== 'object' || validators === null) return false;
    const schemaPrototype = Object.getPrototypeOf(validators) as unknown;
    if (schemaPrototype !== Object.prototype && schemaPrototype !== null) {
      return false;
    }
    if (typeof value !== 'object' || value === null) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;

    const obj = value as Record<string, unknown>;
    if (obj['type'] !== variant) return false;

    const requiredKeys = Object.getOwnPropertyNames(validators) as Array<
      keyof TValidators & string
    >;
    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return false;
      const validator = validators[key];
      if (typeof validator !== 'function' || !validator(obj[key])) return false;
    }

    return true;
  };

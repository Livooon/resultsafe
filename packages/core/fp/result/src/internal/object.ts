/** Checks that an object owns a property key. @internal */
export const hasOwn = <K extends PropertyKey>(
  obj: Record<string, unknown>,
  key: K,
): obj is Record<K, unknown> => Object.prototype.hasOwnProperty.call(obj, key);

/** Checks that a value is a non-null object record. @internal */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Checks an object's complete own shape without invoking property accessors. @internal */
export const hasOnlyOwnDataFields = (
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): value is Record<string, unknown> => {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;

    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
      required.some((key) => !keys.includes(key))
    ) {
      return false;
    }

    return keys.every((key): boolean => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        descriptor.enumerable === true &&
        'value' in descriptor
      );
    });
  } catch {
    return false;
  }
};

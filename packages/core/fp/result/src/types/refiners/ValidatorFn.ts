/**
 * A synchronous validator function that checks if a value is of a specific type.
 *
 * @typeParam T - The type the validator checks for.
 * @param x - The value to validate.
 * @returns `true` if `x` is of type `T`, `false` otherwise.
 *
 * @example
 * ```ts
 * import { ValidatorFn } from '@resultsafe/core-fp-result';
 *
 * const isNumber: ValidatorFn<number> = (x): x is number =>
 *   typeof x === 'number';
 *
 * console.log(isNumber(42)); // true
 * console.log(isNumber('42')); // false
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type ValidatorFn<T = unknown> =
  | ((x: unknown) => x is T)
  | ((x: unknown) => boolean);

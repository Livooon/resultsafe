import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the success value or computes a fallback from the error.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @typeParam U - The fallback output type.
 * @param result - The source `Result`.
 * @param fn - The fallback provider function for `Err`.
 * @returns The success payload or the computed fallback.
 * @since 0.1.0
 * @see {@link unwrapOr} - Uses an eager fallback value.
 * @example
 * ```ts
 * import { Err, unwrapOrElse } from '@resultsafe/core-fp-result';
 *
 * const value = unwrapOrElse(Err('fatal'), (error) => error.length);
 * console.log(value); // 5
 * ```
 * @public
 */
export const unwrapOrElse = <T, E, U>(
  result: ResultLike<T, E>,
  fn: (error: E) => U,
): T | U => {
  if (result.ok === true) {
    return result.value;
  } else {
    return fn(result.error);
  }
};

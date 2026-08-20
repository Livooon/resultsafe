import { hydrateResultValue } from '../internal/resultValue.js';
import type { Result, ResultLike } from '../types/core/index.js';

/**
 * Performs a side effect for the `Ok` value and returns the input `Result`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @param fn - The side effect callback for the success branch.
 * @returns The unchanged `Result`.
 * @since 0.1.0
 * @see {@link tapErr} - Executes a side effect for the error branch.
 * @example
 * ```ts
 * import { Ok, tap } from '@resultsafe/core-fp-result';
 *
 * const result = tap(Ok(1), (value) => console.log(value)); // 1
 * console.log(result.ok); // true
 * ```
 * @public
 */
export const tap = <T, E>(
  result: ResultLike<T, E>,
  fn: (value: T) => void,
): Result<T, E> => {
  if (result.ok === true) {
    fn(result.value);
  }
  return hydrateResultValue(result);
};

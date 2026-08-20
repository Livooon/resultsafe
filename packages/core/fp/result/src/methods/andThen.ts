import { isOk } from '../guards/isOk.js';
import { hydrateResultValue } from '../internal/resultValue.js';
import { type Result, type ResultLike } from '../types/core/index.js';

/**
 * Chains a computation that returns another `Result`.
 *
 * @typeParam T - The input success type.
 * @typeParam U - The output success type.
 * @typeParam E - The shared error type.
 * @param result - The source `Result`.
 * @param fn - The function applied when `result` is `Ok`.
 * @returns The transformed `Result` or the original `Err`.
 * @since 0.1.0
 * @see {@link map} - Transforms only the success value.
 * @example
 * ```ts
 * import { Ok, Err, andThen } from '@resultsafe/core-fp-result';
 *
 * const parsed = andThen(Ok('12'), (value) => {
 *   const n = Number(value);
 *   return Number.isNaN(n) ? Err('invalid') : Ok(n);
 * });
 * console.log(parsed.ok); // true
 * ```
 * @public
 */
export const andThen = <T, U, E, F>(
  result: ResultLike<T, E>,
  fn: (value: T) => ResultLike<U, F>,
): Result<U, E | F> =>
  isOk(result)
    ? hydrateResultValue(fn(result.value))
    : (hydrateResultValue(result) as unknown as Result<U, E | F>);

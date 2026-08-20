import { isErr } from '../guards/isErr.js';
import { hydrateResultValue } from '../internal/resultValue.js';
import { type Result, type ResultLike } from '../types/core/index.js';

/**
 * Recovers from an error by transforming `Err` into another `Result`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The input error value type.
 * @typeParam F - The output error value type.
 * @param result - The source `Result`.
 * @param fn - The recovery function applied to `Err`.
 * @returns The recovered `Result` or the original `Ok`.
 * @since 0.1.0
 * @see {@link andThen} - Chains the success branch.
 * @example
 * ```ts
 * import { Err, Ok, orElse } from '@resultsafe/core-fp-result';
 *
 * const result = orElse(Err('network'), () => Ok('cached'));
 * console.log(result.ok); // true
 * ```
 * @public
 */
export const orElse = <T, E, F>(
  result: ResultLike<T, E>,
  fn: (error: E) => ResultLike<T, F>,
): Result<T, F> =>
  isErr(result)
    ? hydrateResultValue(fn(result.error))
    : (hydrateResultValue(result) as unknown as Result<T, F>);

import { Err } from '../constructors/Err.js';
import { isErr } from '../guards/isErr.js';
import { hydrateResultValue } from '../internal/resultValue.js';
import { type Result, type ResultLike } from '../types/core/index.js';

/**
 * Transforms the error value while preserving the success branch.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The input error value type.
 * @typeParam F - The output error value type.
 * @param result - The source `Result`.
 * @param fn - The transformation function for the error value.
 * @returns The transformed `Err` or the original `Ok`.
 * @since 0.1.0
 * @see {@link map} - Transforms the success branch.
 * @example
 * ```ts
 * import { Err, mapErr } from '@resultsafe/core-fp-result';
 *
 * const result = mapErr(Err('e1'), (error) => `mapped:${error}`);
 * console.log(result.ok); // false
 * ```
 * @public
 */
export const mapErr = <T, E, F>(
  result: ResultLike<T, E>,
  fn: (error: E) => F,
): Result<T, F> =>
  isErr(result)
    ? Err<F, T>(fn(result.error))
    : (hydrateResultValue(result) as unknown as Result<T, F>);

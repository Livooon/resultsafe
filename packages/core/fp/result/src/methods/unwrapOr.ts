import { isOk } from '../guards/isOk.js';
import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the success value or the provided default fallback.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @typeParam U - The fallback value type.
 * @param result - The source `Result`.
 * @param defaultValue - The fallback value for `Err`.
 * @returns The success payload or `defaultValue`.
 * @since 0.1.0
 * @see {@link unwrapOrElse} - Computes the fallback lazily.
 * @example
 * ```ts
 * import { Err, unwrapOr } from '@resultsafe/core-fp-result';
 *
 * const value = unwrapOr(Err('boom'), 0);
 * console.log(value); // 0
 * ```
 * @public
 */
export const unwrapOr = <T, E, U>(
  result: ResultLike<T, E>,
  defaultValue: U,
): T | U => (isOk(result) ? result.value : defaultValue);

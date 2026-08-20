import { ResultExtractionError } from '../errors/ResultExtractionError.js';
import { isErr } from '../guards/isErr.js';
import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the error value or throws an exception if the result is `Ok`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @returns The error payload.
 * @throws ResultExtractionError - Thrown when called on `Ok`.
 * @since 0.1.0
 * @see {@link unwrapOrElse} - Returns a success fallback without throwing.
 * @example
 * ```ts
 * import { Err, unwrapErr } from '@resultsafe/core-fp-result';
 *
 * const error = unwrapErr(Err('boom'));
 * console.log(error); // boom
 * ```
 * @public
 */
export const unwrapErr = <T, E>(result: ResultLike<T, E>): E => {
  if (isErr(result)) {
    return result.error;
  }
  throw new ResultExtractionError(
    'Called unwrapErr on an Ok value',
    result.value,
  );
};

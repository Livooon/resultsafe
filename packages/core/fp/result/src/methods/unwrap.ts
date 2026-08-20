import { ResultExtractionError } from '../errors/ResultExtractionError.js';
import { isOk } from '../guards/isOk.js';
import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the success value or throws an exception if the result is `Err`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @returns The success payload.
 * @throws ResultExtractionError - Thrown when called on `Err`.
 * @since 0.1.0
 * @see {@link unwrapOr} - Returns a fallback instead of throwing.
 * @example
 * ```ts
 * import { Ok, unwrap } from '@resultsafe/core-fp-result';
 *
 * const value = unwrap(Ok(9));
 * console.log(value); // 9
 * ```
 * @public
 */
export const unwrap = <T, E>(result: ResultLike<T, E>): T => {
  if (isOk(result)) {
    return result.value;
  }
  throw new ResultExtractionError(
    'Called unwrap on an Err value',
    result.error,
  );
};

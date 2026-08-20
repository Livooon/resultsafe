import { ResultExtractionError } from '../errors/ResultExtractionError.js';
import { isOk } from '../guards/isOk.js';
import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the success value or throws an exception with a custom message.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @param msg - The error message used when `result` is `Err`.
 * @returns The unwrapped success value.
 * @throws ResultExtractionError - Thrown when `result` is `Err`.
 * @since 0.1.0
 * @see {@link expectErr} - Symmetric helper for the error branch.
 * @example
 * ```ts
 * import { Ok, expect } from '@resultsafe/core-fp-result';
 *
 * const value = expect(Ok(5), 'must be ok');
 * console.log(value); // 5
 * ```
 * @public
 */
export const expect = <T, E>(result: ResultLike<T, E>, msg: string): T => {
  if (isOk(result)) {
    return result.value;
  }
  throw new ResultExtractionError(msg, result.error);
};

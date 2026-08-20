import { ResultExtractionError } from '../errors/ResultExtractionError.js';
import { isErr } from '../guards/isErr.js';
import { type ResultLike } from '../types/core/index.js';

/**
 * Returns the error value or throws an exception with a custom message.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @param msg - The error message used when `result` is `Ok`.
 * @returns The unwrapped error value.
 * @throws ResultExtractionError - Thrown when `result` is `Ok`.
 * @since 0.1.0
 * @see {@link expect} - Symmetric helper for the success branch.
 * @example
 * ```ts
 * import { Err, expectErr } from '@resultsafe/core-fp-result';
 *
 * const error = expectErr(Err('boom'), 'must be err');
 * console.log(error); // boom
 * ```
 * @public
 */
export const expectErr = <T, E>(result: ResultLike<T, E>, msg: string): E => {
  if (isErr(result)) {
    return result.error;
  }
  throw new ResultExtractionError(msg, result.value);
};

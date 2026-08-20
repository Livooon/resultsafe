import { isErr } from '../guards/isErr.js';
import { None, Some } from '../internal/option.js';
import { type Option, type ResultLike } from '../types/core/index.js';

/**
 * Extracts the error branch as an `Option`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @returns `Some(error)` for `Err`, otherwise `None`.
 * @since 0.1.0
 * @see {@link ok} - Extracts the success branch.
 * @example
 * ```ts
 * import { Err, err } from '@resultsafe/core-fp-result';
 *
 * const value = err(Err('boom'));
 * console.log(value.some); // true
 * ```
 * @public
 */
export const err = <T, E>(result: ResultLike<T, E>): Option<E> =>
  isErr(result) ? Some(result.error) : None;

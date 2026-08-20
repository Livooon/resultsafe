import { isOk } from '../guards/isOk.js';
import { None, Some } from '../internal/option.js';
import { type Option, type ResultLike } from '../types/core/index.js';

/**
 * Extracts the success branch as an `Option`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @returns `Some(value)` for `Ok`, otherwise `None`.
 * @since 0.1.0
 * @see {@link err} - Extracts the error branch.
 * @example
 * ```ts
 * import { Ok, ok } from '@resultsafe/core-fp-result';
 *
 * const value = ok(Ok(10));
 * console.log(value.some); // true
 * ```
 * @public
 */
export const ok = <T, E>(result: ResultLike<T, E>): Option<T> =>
  isOk(result) ? Some(result.value) : None;

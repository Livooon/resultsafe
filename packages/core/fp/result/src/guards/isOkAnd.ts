import type { Ok } from '../constructors/Ok.js';
import type { OkLike, Result, ResultLike } from '../types/core/index.js';

/**
 * Checks that the `Result` is successful and satisfies the predicate.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The `Result` to check.
 * @param predicate - The predicate applied to the success value.
 * @returns `true` when the value is `Ok` and the predicate returns `true`.
 * @since 0.1.0
 * @see {@link isOk} - Performs the base success check.
 * @example
 * ```ts
 * import { Ok, isOkAnd } from '@resultsafe/core-fp-result';
 *
 * const result = Ok(8);
 * console.log(isOkAnd(result, (value) => value % 2 === 0)); // true
 * ```
 * @public
 */
export function isOkAnd<T, E, U extends T>(
  result: Result<T, E>,
  predicate: (value: T) => value is U,
): result is Ok<U>;
export function isOkAnd<T, E>(
  result: Result<T, E>,
  predicate: (value: T) => boolean,
): result is Ok<T>;
export function isOkAnd<T, E, U extends T>(
  result: ResultLike<T, E>,
  predicate: (value: T) => value is U,
): result is OkLike<U>;
export function isOkAnd<T, E>(
  result: ResultLike<T, E>,
  predicate: (value: T) => boolean,
): result is OkLike<T>;
export function isOkAnd<T, E>(
  result: ResultLike<T, E>,
  predicate: (value: T) => boolean,
): result is OkLike<T> {
  return result.ok === true && predicate(result.value);
}

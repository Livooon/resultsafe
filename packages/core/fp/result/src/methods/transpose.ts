import { Err } from '../constructors/Err.js';
import { Ok } from '../constructors/Ok.js';
import { None, Some } from '../internal/option.js';
import {
  type Option,
  type Result,
  type ResultLike,
} from '../types/core/index.js';

/**
 * Transforms `Result<Option<T>, E>` into `Option<Result<T, E>>`.
 *
 * @typeParam T - The success value type inside `Option`.
 * @typeParam E - The error value type.
 * @param result - The source `Result` containing an `Option`.
 * @returns The transposed `Option<Result<T, E>>`.
 * @since 0.1.0
 * @see {@link flatten} - Collapses nested `Result` values.
 * @example
 * ```ts
 * import { Ok, transpose } from '@resultsafe/core-fp-result';
 *
 * const value = transpose(Ok({ some: true, value: 2 }));
 * console.log(value.some); // true
 * ```
 * @public
 */
export const transpose = <T, E>(
  result: ResultLike<Option<T>, E>,
): Option<Result<T, E>> => {
  if (result.ok === true) {
    return result.value.some === true
      ? Some(Ok<T, E>(result.value.value))
      : None;
  }
  return Some(Err<E, T>(result.error));
};

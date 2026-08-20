import { type ResultLike } from '../types/core/index.js';

/**
 * Pattern matches the `Result` into a single output value.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @typeParam A - The success handler output type.
 * @typeParam B - The error handler output type.
 * @param result - The source `Result`.
 * @param okFn - The handler for the success branch.
 * @param errFn - The handler for the error branch.
 * @returns The output value produced by the selected handler.
 * @since 0.1.0
 * @see {@link unwrapOrElse} - Similar shape with default fallback semantics.
 * @example
 * ```ts
 * import { Ok, match } from '@resultsafe/core-fp-result';
 *
 * const value = match(Ok(3), (x) => `ok:${x}`, (e) => `err:${e}`);
 * console.log(value); // ok:3
 * ```
 * @public
 */
export const match = <T, E, A, B>(
  result: ResultLike<T, E>,
  okFn: (value: T) => A,
  errFn: (error: E) => B,
): A | B => {
  if (result.ok === true) {
    return okFn(result.value);
  } else {
    const { error } = result;
    return errFn(error);
  }
};

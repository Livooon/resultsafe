import { createErr } from '../internal/resultValue.js';
import type { ResultMethods } from '../types/core/ResultMethods.js';

/**
 * Represents the concrete failure branch of a Result.
 *
 * @typeParam E - The error payload type.
 * @since 0.3.0
 * @example
 * ```ts
 * import { Err, type Err as ErrType } from '@resultsafe/core-fp-result';
 *
 * const result: ErrType<string> = Err('failure');
 * ```
 * @public
 */
export type Err<E> = ResultMethods<never, E> & {
  readonly ok: false;
  readonly error: E;
};

/**
 * Creates an error `Result` value from the provided error payload.
 *
 * @typeParam E - The error value type.
 * @typeParam T - The success type for the resulting `Result`.
 * @param error - The error payload to wrap.
 * @returns A `Result` with `ok: false` and the provided `error`.
 * @since 0.1.0
 * @see {@link Ok} - Creates a successful `Result`.
 * @example
 * ```ts
 * import { Err } from '@resultsafe/core-fp-result';
 *
 * const result = Err<string, number>('boom');
 * console.log(result.ok); // false
 * ```
 * @public
 */
export const Err = <E, _T = never>(error: E): Err<E> => createErr<E>(error);

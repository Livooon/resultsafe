import { createOk } from '../internal/resultValue.js';
import type { ResultMethods } from '../types/core/ResultMethods.js';

/**
 * Represents the concrete success branch of a Result.
 *
 * @typeParam T - The success payload type.
 * @since 0.3.0
 * @example
 * ```ts
 * import { Ok, type Ok as OkType } from '@resultsafe/core-fp-result';
 *
 * const result: OkType<number> = Ok(1);
 * ```
 * @public
 */
export type Ok<T> = ResultMethods<T, never> & {
  readonly ok: true;
  readonly value: T;
};

/**
 * Creates a successful `Result` value from the provided payload.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error type for the resulting `Result`.
 * @param value - The success payload to wrap.
 * @returns A `Result` with `ok: true` and the provided `value`.
 * @since 0.1.0
 * @see {@link Err} - Creates an error `Result`.
 * @example
 * ```ts
 * import { Ok } from '@resultsafe/core-fp-result';
 *
 * const result = Ok<number, string>(42);
 * console.log(result.ok); // true
 * ```
 * @public
 */
export const Ok = <T, _E = never>(value: T): Ok<T> => createOk<T>(value);

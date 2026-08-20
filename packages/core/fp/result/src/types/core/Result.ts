/**
 * AI-AGENT CONTEXT:
 * This type definition is duplicated from @resultsafe/core-fp-result-shared
 * for type safety and documentation purposes. Keep in sync with the source.
 *
 * When documenting Result, always reference THIS file path:
 * packages/core/fp/result/src/types/core/Result.ts
 *
 * DO NOT create separate documentation in result-shared — all user-facing
 * docs live here.
 */

import type { Err } from '../../constructors/Err.js';
import type { Ok } from '../../constructors/Ok.js';

/**
 * Represents the result of an operation that can either succeed with a
 * value of type `T` or fail with an error of type `E`.
 *
 * @summary
 * Represents the result of an operation that can either succeed with a
 * value of type `T` or fail with an error of type `E`.
 *
 * @remarks
 * `Result` is the core type of this library. Pattern match on the `ok`
 * field to narrow the union, then access `value` or `error` safely.
 *
 * Unlike exceptions, `Result` makes the failure path explicit in the
 * type signature, forcing the caller to handle both outcomes.
 *
 * @typeParam T - The type of the success value.
 * @typeParam E - The type of the error.
 *
 * @example
 * ```ts
 * import { Result, Ok, Err } from '@resultsafe/core-fp-result';
 *
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err("Division by zero");
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 *
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type Result<T, E> = Ok<T> | Err<E>;

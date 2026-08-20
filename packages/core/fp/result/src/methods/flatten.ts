import { hydrateResultValue } from '../internal/resultValue.js';
import { type Result, type ResultLike } from '../types/core/index.js';

/**
 * Collapses a nested `Result<Result<T, E>, E>` one level.
 *
 * @typeParam T - The inner success value type.
 * @typeParam E - The shared error value type.
 * @param result - The nested `Result` to collapse.
 * @returns A single-layer `Result<T, E>`.
 * @since 0.1.0
 * @see {@link andThen} - Chains computations that already return `Result`.
 * @example
 * ```ts
 * import { Ok, flatten } from '@resultsafe/core-fp-result';
 *
 * const value = flatten(Ok(Ok(3)));
 * console.log(value.ok); // true
 * ```
 * @public
 */
export const flatten = <T, E>(
  result: ResultLike<ResultLike<T, E>, E>,
): Result<T, E> =>
  result.ok === true
    ? hydrateResultValue(result.value)
    : (hydrateResultValue(result) as unknown as Result<T, E>);

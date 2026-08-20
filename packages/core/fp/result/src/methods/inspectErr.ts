import { tapErr } from './tapErr.js';

/**
 * Performs a side effect for the error value and returns the original `Result`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @param fn - The side effect function for the error branch.
 * @returns The same `Result` instance.
 * @since 0.1.0
 * @see {@link tapErr} - Equivalent helper for the error branch.
 * @example
 * ```ts
 * import { Err, inspectErr } from '@resultsafe/core-fp-result';
 *
 * const result = inspectErr(Err('boom'), (error) => console.log(error)); // boom
 * console.log(result.ok); // false
 * ```
 * @public
 */
export const inspectErr = tapErr;

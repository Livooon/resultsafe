import { tap } from './tap.js';

/**
 * Performs a side effect for the success value and returns the original `Result`.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error value type.
 * @param result - The source `Result`.
 * @param fn - The side effect function for the success branch.
 * @returns The same `Result` instance.
 * @since 0.1.0
 * @see {@link tap} - Equivalent helper for the success branch.
 * @example
 * ```ts
 * import { Ok, inspect } from '@resultsafe/core-fp-result';
 *
 * const result = inspect(Ok(1), (value) => console.log(value)); // 1
 * console.log(result.ok); // true
 * ```
 * @public
 */
export const inspect = tap;

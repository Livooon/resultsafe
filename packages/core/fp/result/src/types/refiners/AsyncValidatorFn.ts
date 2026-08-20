/**
 * An asynchronous validator function that checks if a value is valid.
 *
 * @param value - The value to validate.
 * @returns `true` if valid or `false` otherwise, directly or in a promise.
 *
 * @example
 * ```ts
 * import { AsyncValidatorFn } from '@resultsafe/core-fp-result';
 *
 * const isValidId: AsyncValidatorFn = async (value) => {
 *   // Simulate async database check
 *   return typeof value === 'string' && value.length > 0;
 * };
 * ```
 *
 * @since 0.1.8
 * @public
 */
export type AsyncValidatorFn<T = unknown> = ((
  value: unknown,
) => boolean | Promise<boolean>) & {
  /** Carries explicitly declared async schema output without affecting runtime. */
  readonly __output?: T;
};

import type { Cause } from './Cause.js';

export type ExitSuccess<T> = {
  readonly _tag: 'Success';
  readonly value: T;
};

/** Named to avoid colliding with the package's structured Failure model. @since 0.3.0 */
export type ExitFailure<E> = {
  readonly _tag: 'Failure';
  readonly cause: Cause<E>;
};

/** The success or full failure cause produced by a completed computation. @since 0.3.0 */
export type Exit<T, E> = ExitSuccess<T> | ExitFailure<E>;

/** Exhaustive handlers for an Exit. @since 0.3.0 */
export type ExitMatchers<T, E, R> = {
  readonly Success: (value: T) => R;
  readonly Failure: (cause: Cause<E>) => R;
};

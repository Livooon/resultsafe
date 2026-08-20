import type { Cause } from '../types/core/Cause.js';
import type {
  Exit as ExitValue,
  ExitFailure as ExitFailureValue,
  ExitSuccess as ExitSuccessValue,
} from '../types/core/Exit.js';

/** Public Exit type paired with the Exit constructor namespace. @since 0.3.0 */
export type Exit<T, E> = ExitValue<T, E>;

/** Public success variant type paired with its constructor. @since 0.3.0 */
export type ExitSuccess<T> = ExitSuccessValue<T>;

/** Collision-safe failure variant type paired with its constructor. @since 0.3.0 */
export type ExitFailure<E> = ExitFailureValue<E>;

/**
 * Construct a successful Exit, preserving the value by reference.
 * @example ExitSuccess(1)
 * @returns A frozen Success Exit node.
 * @since 0.3.0
 */
export const ExitSuccess = <T>(value: T): ExitSuccessValue<T> =>
  Object.freeze({ _tag: 'Success', value });

/**
 * Construct a failed Exit, including Empty causes.
 * @example ExitFailure(Cause.Empty())
 * @returns A frozen Failure Exit node.
 * @since 0.3.0
 */
export const ExitFailure = <E>(cause: Cause<E>): ExitFailureValue<E> =>
  Object.freeze({ _tag: 'Failure', cause });

/** Namespaced Exit constructors. @since 0.3.0 */
export const Exit = Object.freeze({
  Success: ExitSuccess,
  Failure: ExitFailure,
});

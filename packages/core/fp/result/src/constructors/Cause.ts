import type {
  Cause as CauseValue,
  DieCause,
  EmptyCause,
  FailCause,
  InterruptCause,
  ParallelCause,
  SequentialCause,
} from '../types/core/Cause.js';
import type { Failure } from '../types/core/Failure.js';

/** Public Cause type paired with the Cause constructor namespace. @since 0.3.0 */
export type Cause<E> = CauseValue<E>;

/**
 * Construct an empty Cause.
 * @example CauseEmpty()
 * @returns A frozen Empty Cause node.
 * @since 0.3.0
 */
export const CauseEmpty = (): EmptyCause => Object.freeze({ _tag: 'Empty' });

/**
 * Construct a typed-error Cause, preserving the error by reference.
 * @example CauseFail('error')
 * @returns A frozen Fail Cause node.
 * @since 0.3.0
 */
export const CauseFail = <E>(error: E): FailCause<E> =>
  Object.freeze({ _tag: 'Fail', error });

/**
 * Construct a defect Cause from a structured Failure.
 * @example CauseDie(failure)
 * @returns A frozen Die Cause node.
 * @since 0.3.0
 */
export const CauseDie = (failure: Failure): DieCause =>
  Object.freeze({ _tag: 'Die', failure });

/**
 * Construct an interruption Cause from a structured Failure.
 * @example CauseInterrupt(failure)
 * @returns A frozen Interrupt Cause node.
 * @since 0.3.0
 */
export const CauseInterrupt = (failure: Failure): InterruptCause =>
  Object.freeze({ _tag: 'Interrupt', failure });

/**
 * Construct a sequential Cause.
 * @example CauseSequential(left, right)
 * @returns A frozen Sequential Cause node.
 * @since 0.3.0
 */
export const CauseSequential = <E>(
  left: CauseValue<E>,
  right: CauseValue<E>,
): SequentialCause<E> => Object.freeze({ _tag: 'Sequential', left, right });

/**
 * Construct a parallel Cause.
 * @example CauseParallel(left, right)
 * @returns A frozen Parallel Cause node.
 * @since 0.3.0
 */
export const CauseParallel = <E>(
  left: CauseValue<E>,
  right: CauseValue<E>,
): ParallelCause<E> => Object.freeze({ _tag: 'Parallel', left, right });

/** Namespaced Cause constructors. @since 0.3.0 */
export const Cause = Object.freeze({
  Empty: CauseEmpty,
  Fail: CauseFail,
  Die: CauseDie,
  Interrupt: CauseInterrupt,
  Sequential: CauseSequential,
  Parallel: CauseParallel,
});

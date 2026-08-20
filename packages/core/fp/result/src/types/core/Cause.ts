import type { Failure } from './Failure.js';

/** Limits used when validating an unknown Cause graph. @since 0.3.0 */
export type CauseLimits = {
  readonly max_depth: number;
  readonly max_nodes: number;
};

export type EmptyCause = {
  readonly _tag: 'Empty';
};

export type FailCause<E> = {
  readonly _tag: 'Fail';
  readonly error: E;
};

export type DieCause = {
  readonly _tag: 'Die';
  readonly failure: Failure;
};

export type InterruptCause = {
  readonly _tag: 'Interrupt';
  readonly failure: Failure;
};

export type SequentialCause<E> = {
  readonly _tag: 'Sequential';
  readonly left: Cause<E>;
  readonly right: Cause<E>;
};

export type ParallelCause<E> = {
  readonly _tag: 'Parallel';
  readonly left: Cause<E>;
  readonly right: Cause<E>;
};

/** A lossless description of typed errors, defects, interruptions, and composition. @since 0.3.0 */
export type Cause<E> =
  | EmptyCause
  | FailCause<E>
  | DieCause
  | InterruptCause
  | SequentialCause<E>
  | ParallelCause<E>;

/** Exhaustive handlers for a single Cause node. @since 0.3.0 */
export type CauseMatchers<E, R> = {
  readonly Empty: () => R;
  readonly Fail: (error: E) => R;
  readonly Die: (failure: Failure) => R;
  readonly Interrupt: (failure: Failure) => R;
  readonly Sequential: (left: Cause<E>, right: Cause<E>) => R;
  readonly Parallel: (left: Cause<E>, right: Cause<E>) => R;
};

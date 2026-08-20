import {
  CauseDie,
  CauseEmpty,
  CauseFail,
  CauseInterrupt,
  CauseParallel,
  CauseSequential,
  type Cause as ResultSafeCause,
  type Failure,
} from '@resultsafe/core-fp-result';
import * as EffectCause from 'effect/Cause';
import type { FiberId } from 'effect/FiberId';

/** Required mappings from Effect runtime-only values to portable failures. */
export type EffectCauseToResultSafeOptions = {
  readonly defectToFailure: (defect: unknown) => Failure;
  readonly fiberIdToFailure: (fiberId: FiberId) => Failure;
};

/** Required mappings from portable failures to Effect runtime values. */
export type ResultSafeCauseToEffectOptions = {
  readonly failureToDefect: (failure: Failure) => unknown;
  readonly failureToFiberId: (failure: Failure) => FiberId;
};

/**
 * Convert an Effect Cause without serializing defects, stacks, or fiber identity.
 * Binary grouping and left-to-right order are retained exactly.
 */
export const effectCauseToResultSafe = <E>(
  cause: EffectCause.Cause<E>,
  options: EffectCauseToResultSafeOptions,
): ResultSafeCause<E> => {
  switch (cause._tag) {
    case 'Empty':
      return CauseEmpty();
    case 'Fail':
      return CauseFail(cause.error);
    case 'Die':
      return CauseDie(options.defectToFailure(cause.defect));
    case 'Interrupt':
      return CauseInterrupt(options.fiberIdToFailure(cause.fiberId));
    case 'Sequential':
      return CauseSequential(
        effectCauseToResultSafe(cause.left, options),
        effectCauseToResultSafe(cause.right, options),
      );
    case 'Parallel':
      return CauseParallel(
        effectCauseToResultSafe(cause.left, options),
        effectCauseToResultSafe(cause.right, options),
      );
  }
};

/**
 * Convert a portable Cause using caller-defined runtime reconstruction.
 * Binary grouping and left-to-right order are retained exactly.
 */
export const resultSafeCauseToEffect = <E>(
  cause: ResultSafeCause<E>,
  options: ResultSafeCauseToEffectOptions,
): EffectCause.Cause<E> => {
  switch (cause._tag) {
    case 'Empty':
      return EffectCause.empty;
    case 'Fail':
      return EffectCause.fail(cause.error);
    case 'Die':
      return EffectCause.die(options.failureToDefect(cause.failure));
    case 'Interrupt':
      return EffectCause.interrupt(options.failureToFiberId(cause.failure));
    case 'Sequential':
      return EffectCause.sequential(
        resultSafeCauseToEffect(cause.left, options),
        resultSafeCauseToEffect(cause.right, options),
      );
    case 'Parallel':
      return EffectCause.parallel(
        resultSafeCauseToEffect(cause.left, options),
        resultSafeCauseToEffect(cause.right, options),
      );
  }
};

import {
  ExitFailure,
  ExitSuccess,
  type Exit as ResultSafeExit,
} from '@resultsafe/core-fp-result';
import * as EffectExit from 'effect/Exit';

import {
  effectCauseToResultSafe,
  resultSafeCauseToEffect,
  type EffectCauseToResultSafeOptions,
  type ResultSafeCauseToEffectOptions,
} from './Cause.js';

/** Convert an Effect Exit, including a failure whose Cause is Empty. */
export const effectExitToResultSafe = <A, E>(
  exit: EffectExit.Exit<A, E>,
  options: EffectCauseToResultSafeOptions,
): ResultSafeExit<A, E> =>
  exit._tag === 'Success'
    ? ExitSuccess(exit.value)
    : ExitFailure(effectCauseToResultSafe(exit.cause, options));

/**
 * Convert a portable Exit. Effect 3.22.1 represents Failure(Empty) with
 * Exit.failCause(Cause.empty), so this conversion requires no fabricated cause.
 */
export const resultSafeExitToEffect = <A, E>(
  exit: ResultSafeExit<A, E>,
  options: ResultSafeCauseToEffectOptions,
): EffectExit.Exit<A, E> =>
  exit._tag === 'Success'
    ? EffectExit.succeed(exit.value)
    : EffectExit.failCause(resultSafeCauseToEffect(exit.cause, options));

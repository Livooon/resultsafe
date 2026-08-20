import type {
  Cause as ResultSafeCause,
  Exit as ResultSafeExit,
  Failure,
} from '@resultsafe/core-fp-result';
import type { Cause as EffectCause } from 'effect/Cause';
import type { Exit as EffectExit } from 'effect/Exit';
import type { FiberId } from 'effect/FiberId';

import {
  effectCauseToResultSafe,
  effectExitToResultSafe,
  resultSafeCauseToEffect,
  resultSafeExitToEffect,
} from '../../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const effectCause: EffectCause<{ readonly effectError: string }>;
declare const resultSafeCause: ResultSafeCause<{
  readonly resultSafeError: number;
}>;
declare const effectExit: EffectExit<
  { readonly value: string },
  { readonly effectError: string }
>;
declare const resultSafeExit: ResultSafeExit<
  { readonly value: number },
  { readonly resultSafeError: number }
>;
declare const failure: Failure;
declare const fiberId: FiberId;

const fromEffectOptions = {
  defectToFailure: (_defect: unknown): Failure => failure,
  fiberIdToFailure: (_fiberId: FiberId): Failure => failure,
};
const toEffectOptions = {
  failureToDefect: (_failure: Failure): unknown => new Error(),
  failureToFiberId: (_failure: Failure): FiberId => fiberId,
};

const portableCause = effectCauseToResultSafe(effectCause, fromEffectOptions);
const runtimeCause = resultSafeCauseToEffect(resultSafeCause, toEffectOptions);
const portableExit = effectExitToResultSafe(effectExit, fromEffectOptions);
const runtimeExit = resultSafeExitToEffect(resultSafeExit, toEffectOptions);

type _PortableCause = Expect<
  Equal<
    typeof portableCause,
    ResultSafeCause<{ readonly effectError: string }>
  >
>;
type _RuntimeCause = Expect<
  Equal<
    typeof runtimeCause,
    EffectCause<{ readonly resultSafeError: number }>
  >
>;
type _PortableExit = Expect<
  Equal<
    typeof portableExit,
    ResultSafeExit<
      { readonly value: string },
      { readonly effectError: string }
    >
  >
>;
type _RuntimeExit = Expect<
  Equal<
    typeof runtimeExit,
    EffectExit<
      { readonly value: number },
      { readonly resultSafeError: number }
    >
  >
>;

// @ts-expect-error defect and interruption mappings are mandatory
effectCauseToResultSafe(effectCause, {});
// @ts-expect-error reverse defect and interruption mappings are mandatory
resultSafeCauseToEffect(resultSafeCause, {});

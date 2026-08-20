import {
  Cause,
  CauseFail,
  ExitFailure,
  ExitSuccess,
  exitToResult,
  exitToResultCollapsed,
  isCause,
  isExit,
  resultToExit,
  type Cause as CauseType,
  type Exit as ExitType,
  type Result,
} from '../../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

declare const result: Result<number, string>;
declare const exit: ExitType<number, string>;

const projected: ExitType<number, string> = resultToExit(result);
const lossless = exitToResult(exit);
const collapsed = exitToResultCollapsed(exit, (cause) =>
  cause._tag === 'Fail' ? cause.error : 'collapsed',
);
const distinctlyCollapsed = exitToResultCollapsed(exit, (cause) => ({
  tag: cause._tag,
}));
const emptyFailure: ExitType<never, string> = ExitFailure(Cause.Empty());
const typedFailure: CauseType<string> = CauseFail('bad');
const success: ExitType<number, never> = ExitSuccess(1);

// @ts-expect-error Exit-to-Result error collapse must always be explicit.
exitToResultCollapsed(exit);

type LosslessError = Assert<
  Equal<typeof lossless, Result<number, CauseType<string>>>
>;
type CollapsedError = Assert<Equal<typeof collapsed, Result<number, string>>>;
type DistinctCollapsedError = Assert<
  Equal<typeof distinctlyCollapsed, Result<number, { tag: CauseType<string>['_tag'] }>>
>;

declare const unknownValue: unknown;
if (isCause(unknownValue)) {
  const unknownCause: CauseType<unknown> = unknownValue;
  // @ts-expect-error An unchecked Fail payload cannot narrow to string.
  const stringCause: CauseType<string> = unknownValue;
  void unknownCause;
  void stringCause;
}
if (isCause(unknownValue, (value): value is string => typeof value === 'string')) {
  const stringCause: CauseType<string> = unknownValue;
  void stringCause;
}
if (
  isCause(
    unknownValue,
    { max_depth: 32, max_nodes: 1024 },
    (value): value is string => typeof value === 'string',
  )
) {
  const stringCause: CauseType<string> = unknownValue;
  void stringCause;
}
if (isExit(unknownValue)) {
  const unknownExit: ExitType<unknown, unknown> = unknownValue;
  // @ts-expect-error Unchecked Exit payloads remain unknown.
  const stringExit: ExitType<number, string> = unknownValue;
  void unknownExit;
  void stringExit;
}
if (
  isExit(
    unknownValue,
    (value): value is number => typeof value === 'number',
    (error): error is string => typeof error === 'string',
  )
) {
  const typedExit: ExitType<number, string> = unknownValue;
  void typedExit;
}
if (
  isExit(
    unknownValue,
    { max_depth: 32, max_nodes: 1024 },
    (value): value is number => typeof value === 'number',
    (error): error is string => typeof error === 'string',
  )
) {
  const typedExit: ExitType<number, string> = unknownValue;
  void typedExit;
}

// @ts-expect-error Type arguments cannot assert a Cause payload without a predicate.
isCause<string>(unknownValue);
// @ts-expect-error Typed Exit narrowing requires both payload predicates.
isExit<number, string>(unknownValue);

void projected;
void emptyFailure;
void typedFailure;
void success;

export type { CollapsedError, DistinctCollapsedError, LosslessError };

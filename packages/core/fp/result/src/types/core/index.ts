// Core types (local definitions for documentation and type safety)
export type {
  Cause,
  CauseLimits,
  CauseMatchers,
  DieCause,
  EmptyCause,
  FailCause,
  InterruptCause,
  ParallelCause,
  SequentialCause,
} from './Cause.js';
export type { Exit, ExitFailure, ExitMatchers, ExitSuccess } from './Exit.js';
export type {
  FailureClassification,
  FailureInput,
  FailureJsonValue,
  FailureLimits,
} from './Failure.js';
export type { Option } from './Option.js';
export type { Result } from './Result.js';
export type { ErrData, OkData, ResultData } from './ResultData.js';
export type { ErrLike, OkLike, ResultLike } from './ResultLike.js';
export type { ResultMethods } from './ResultMethods.js';

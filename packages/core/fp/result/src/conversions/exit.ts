import { CauseFail } from '../constructors/Cause.js';
import { Err } from '../constructors/Err.js';
import { ExitFailure, ExitSuccess } from '../constructors/Exit.js';
import { Ok } from '../constructors/Ok.js';
import type { Cause } from '../types/core/Cause.js';
import type { Exit } from '../types/core/Exit.js';
import type { Result } from '../types/core/Result.js';

/**
 * Project a Result into an Exit, preserving both payloads by reference.
 * @example resultToExit(Ok(1))
 * @returns The corresponding Exit.
 * @since 0.3.0
 */
export function resultToExit<T, E>(result: Result<T, E>): Exit<T, E> {
  return result.ok
    ? ExitSuccess(result.value)
    : ExitFailure(CauseFail(result.error));
}

/**
 * Convert an Exit to Result without discarding any failure information.
 * @example exitToResult(Exit.Failure(Cause.Empty()))
 * @returns A Result whose error is the complete Cause.
 * @since 0.3.0
 */
export function exitToResult<T, E>(exit: Exit<T, E>): Result<T, Cause<E>> {
  return exit._tag === 'Success' ? Ok(exit.value) : Err(exit.cause);
}

/**
 * Convert an Exit using an explicit failure-collapse policy.
 * @example exitToResultCollapsed(exit, () => 'error')
 * @returns A Result with the collapsed error type.
 * @since 0.3.0
 */
export function exitToResultCollapsed<T, E, F>(
  exit: Exit<T, E>,
  collapse: (cause: Cause<E>) => F,
): Result<T, F> {
  return exit._tag === 'Success' ? Ok(exit.value) : Err(collapse(exit.cause));
}

import type { Exit, ExitMatchers } from '../types/core/Exit.js';

/**
 * Exhaustively match an Exit.
 * @example matchExit(Exit.Success(1), handlers)
 * @returns The selected handler's result.
 * @since 0.3.0
 */
export function matchExit<T, E, R>(
  exit: Exit<T, E>,
  matchers: ExitMatchers<T, E, R>,
): R {
  return exit._tag === 'Success'
    ? matchers.Success(exit.value)
    : matchers.Failure(exit.cause);
}

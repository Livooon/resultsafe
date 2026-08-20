import type { Cause, CauseMatchers } from '../types/core/Cause.js';

/**
 * Exhaustively match one Cause node.
 * @example matchCause(Cause.Empty(), handlers)
 * @returns The selected handler's result.
 * @since 0.3.0
 */
export function matchCause<E, R>(
  cause: Cause<E>,
  matchers: CauseMatchers<E, R>,
): R {
  switch (cause._tag) {
    case 'Empty':
      return matchers.Empty();
    case 'Fail':
      return matchers.Fail(cause.error);
    case 'Die':
      return matchers.Die(cause.failure);
    case 'Interrupt':
      return matchers.Interrupt(cause.failure);
    case 'Sequential':
      return matchers.Sequential(cause.left, cause.right);
    case 'Parallel':
      return matchers.Parallel(cause.left, cause.right);
  }
}

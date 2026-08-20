import type { Failure as FailureValue } from '../constructors/Failure.js';
import { Failure } from '../constructors/Failure.js';
import type { FailureLimits } from '../types/core/Failure.js';

/**
 * Return whether unknown input conforms to the portable Failure model.
 * @example isFailure({ schema_version: '1.0.0', code: 'urn:example:not-found' })
 * @returns Whether the input is valid portable Failure data.
 * @since 0.3.0
 */
export function isFailure(
  value: unknown,
  limits?: FailureLimits,
): value is FailureValue {
  try {
    Failure(value as Parameters<typeof Failure>[0], limits);
    return true;
  } catch {
    return false;
  }
}

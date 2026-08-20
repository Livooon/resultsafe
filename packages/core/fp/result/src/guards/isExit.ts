import { hasOnlyOwnDataFields } from '../internal/object.js';
import type { CauseLimits } from '../types/core/Cause.js';
import type { Exit } from '../types/core/Exit.js';
import { isCause } from './isCause.js';

type PayloadPredicate<T> = (value: unknown) => value is T;

/**
 * Validate an unknown Exit and its Cause graph, treating success data as opaque.
 * @example isExit(Exit.Success(1))
 * @returns Whether the value is a structurally valid Exit.
 * @since 0.3.0
 */
export function isExit(
  value: unknown,
  limits?: CauseLimits,
): value is Exit<unknown, unknown>;
export function isExit<T, E>(
  value: unknown,
  isValue: PayloadPredicate<T>,
  isError: PayloadPredicate<E>,
  limits?: CauseLimits,
): value is Exit<T, E>;
export function isExit<T, E>(
  value: unknown,
  limits: CauseLimits | undefined,
  isValue: PayloadPredicate<T>,
  isError: PayloadPredicate<E>,
): value is Exit<T, E>;
export function isExit<T, E>(
  value: unknown,
  limitsOrValuePredicate?: CauseLimits | PayloadPredicate<T>,
  valueOrErrorPredicate?: PayloadPredicate<T> | PayloadPredicate<E>,
  errorPredicateOrLimits?: CauseLimits | PayloadPredicate<E>,
): value is Exit<T, E> {
  try {
    if (typeof value !== 'object' || value === null) return false;
    const tag = Reflect.getOwnPropertyDescriptor(value, '_tag');
    if (tag === undefined || !('value' in tag)) return false;

    const predicatesFirst = typeof limitsOrValuePredicate === 'function';
    const isValue = (
      predicatesFirst ? limitsOrValuePredicate : valueOrErrorPredicate
    ) as PayloadPredicate<T> | undefined;
    const isError = (
      predicatesFirst
        ? valueOrErrorPredicate
        : typeof errorPredicateOrLimits === 'function'
          ? errorPredicateOrLimits
          : undefined
    ) as PayloadPredicate<E> | undefined;
    const limits = predicatesFirst
      ? typeof errorPredicateOrLimits === 'function'
        ? undefined
        : errorPredicateOrLimits
      : limitsOrValuePredicate;

    if (tag.value === 'Success') {
      if (!hasOnlyOwnDataFields(value, ['_tag', 'value'])) return false;
      if (isValue === undefined && isError === undefined) return true;
      if (isValue === undefined) return false;
      return isValue(Reflect.getOwnPropertyDescriptor(value, 'value')?.value);
    }
    if (
      tag.value !== 'Failure' ||
      !hasOnlyOwnDataFields(value, ['_tag', 'cause'])
    ) {
      return false;
    }
    const cause = Reflect.getOwnPropertyDescriptor(value, 'cause')?.value;
    if (isValue === undefined && isError === undefined)
      return isCause(cause, limits);
    return isError ? isCause(cause, isError, limits) : false;
  } catch {
    return false;
  }
}

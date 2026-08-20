import { hasOnlyOwnDataFields } from '../internal/object.js';
import type { Cause, CauseLimits } from '../types/core/Cause.js';
import { isFailure } from './isFailure.js';

export const DEFAULT_CAUSE_LIMITS: CauseLimits = Object.freeze({
  max_depth: 32,
  max_nodes: 1024,
});

const validLimits = (limits: CauseLimits): boolean =>
  Number.isSafeInteger(limits.max_depth) &&
  limits.max_depth >= 0 &&
  Number.isSafeInteger(limits.max_nodes) &&
  limits.max_nodes >= 1;

type PayloadPredicate<T> = (value: unknown) => value is T;

/**
 * Validate an unknown Cause without traversing arbitrary typed-error payloads.
 * @example isCause(Cause.Fail('error'))
 * @returns Whether the value is a structurally valid, bounded Cause graph.
 * @since 0.3.0
 */
export function isCause(
  value: unknown,
  limits?: CauseLimits,
): value is Cause<unknown>;
export function isCause<E>(
  value: unknown,
  isError: PayloadPredicate<E>,
  limits?: CauseLimits,
): value is Cause<E>;
export function isCause<E>(
  value: unknown,
  limits: CauseLimits | undefined,
  isError: PayloadPredicate<E>,
): value is Cause<E>;
export function isCause<E>(
  value: unknown,
  limitsOrPredicate: CauseLimits | PayloadPredicate<E> = DEFAULT_CAUSE_LIMITS,
  predicateOrLimits?: CauseLimits | PayloadPredicate<E>,
): value is Cause<E> {
  const isError =
    typeof limitsOrPredicate === 'function'
      ? limitsOrPredicate
      : typeof predicateOrLimits === 'function'
        ? predicateOrLimits
        : undefined;
  const limits =
    typeof limitsOrPredicate === 'function'
      ? ((predicateOrLimits as CauseLimits | undefined) ?? DEFAULT_CAUSE_LIMITS)
      : limitsOrPredicate;
  if (!validLimits(limits)) return false;

  const ancestors = new Set<object>();
  const state = { nodes: 0 };
  const visit = (node: unknown, depth: number): boolean => {
    if (
      depth > limits.max_depth ||
      typeof node !== 'object' ||
      node === null ||
      Array.isArray(node) ||
      ancestors.has(node) ||
      ++state.nodes > limits.max_nodes
    ) {
      return false;
    }

    ancestors.add(node);
    try {
      const tag = Reflect.getOwnPropertyDescriptor(node, '_tag');
      if (tag === undefined || !('value' in tag)) return false;
      switch (tag.value) {
        case 'Empty':
          return hasOnlyOwnDataFields(node, ['_tag']);
        case 'Fail':
          if (!hasOnlyOwnDataFields(node, ['_tag', 'error'])) return false;
          if (isError === undefined) return true;
          return isError(
            Reflect.getOwnPropertyDescriptor(node, 'error')?.value,
          );
        case 'Die':
        case 'Interrupt':
          if (!hasOnlyOwnDataFields(node, ['_tag', 'failure'])) return false;
          return isFailure(
            Reflect.getOwnPropertyDescriptor(node, 'failure')?.value,
          );
        case 'Sequential':
        case 'Parallel':
          if (!hasOnlyOwnDataFields(node, ['_tag', 'left', 'right']))
            return false;
          return (
            visit(
              Reflect.getOwnPropertyDescriptor(node, 'left')?.value,
              depth + 1,
            ) &&
            visit(
              Reflect.getOwnPropertyDescriptor(node, 'right')?.value,
              depth + 1,
            )
          );
        default:
          return false;
      }
    } catch {
      return false;
    } finally {
      ancestors.delete(node);
    }
  };

  return visit(value, 0);
}

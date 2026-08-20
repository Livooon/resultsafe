import type { Handler, Matcher, VariantOf } from './types/index.js';

const runHandlers = <T extends VariantOf>(
  value: T,
  handlers: readonly Handler<string, T, unknown>[],
):
  | { readonly matched: true; readonly value: unknown }
  | { readonly matched: false } => {
  for (const handler of handlers) {
    if (value.type === handler.variant) {
      return {
        matched: true,
        value: (handler.fn as (input: T) => unknown)(value),
      };
    }
  }
  return { matched: false };
};

/**
 * Creates an immutable chained matcher for a discriminated union value.
 *
 * Each `with` returns a new builder, excludes that branch from later handlers,
 * and accumulates its output type. `otherwise` receives only the remaining
 * union members.
 *
 * @since 0.1.0
 * @public
 */
export const matchVariant = <T extends VariantOf>(value: T): Matcher<T> => {
  const build = (
    handlers: readonly Handler<string, T, unknown>[],
  ): Matcher<T, never, T> =>
    ({
      with: (variant: string, fn: (input: T) => unknown) =>
        build([...handlers, { variant, fn }]),
      otherwise: (fallback: (input: T) => unknown) => ({
        run: () => {
          const result = runHandlers(value, handlers);
          return result.matched ? result.value : fallback(value);
        },
      }),
    }) as Matcher<T, never, T>;

  return build([]);
};

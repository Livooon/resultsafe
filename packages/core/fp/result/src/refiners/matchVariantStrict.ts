import type { Handler, MatchBuilder, VariantOf } from './types/index.js';

/**
 * Creates an immutable exhaustive matcher for a discriminated union value.
 *
 * `run` is callable only after every statically known branch is registered.
 * The runtime error therefore represents a caller contract violation.
 *
 * @since 0.1.0
 * @public
 */
export const matchVariantStrict = <T extends VariantOf>(
  value: T,
): MatchBuilder<T> => {
  const build = (
    handlers: readonly Handler<string, T, unknown>[],
  ): MatchBuilder<T, never, T> =>
    ({
      with: (variant: string, fn: (input: T) => unknown) =>
        build([...handlers, { variant, fn }]),
      run: () => {
        for (const handler of handlers) {
          if (value.type === handler.variant) {
            return (handler.fn as (input: T) => unknown)(value);
          }
        }
        throw new Error(`Unmatched variant: ${String(value.type)}`);
      },
    }) as unknown as MatchBuilder<T, never, T>;

  return build([]);
};

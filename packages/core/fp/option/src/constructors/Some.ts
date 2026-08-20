import type { Option } from '@resultsafe/core-fp-option-shared';

export const Some = <T>(value: T): Option<T> =>
  Object.freeze({ some: true, value }) as Option<T>;


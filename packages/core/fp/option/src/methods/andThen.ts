import type { Option } from '@resultsafe/core-fp-option-shared';
import { isSome } from '../guards/isSome.js';

export const andThen = <T, U>(
  option: Option<T>,
  fn: (value: T) => Option<U>,
): Option<U> => (isSome(option) ? fn(option.value) : (option as Option<U>));


import type { Option } from '@resultsafe/core-fp-option-shared';
import { None, Some } from '../constructors/index.js';
import { isSome } from '../guards/isSome.js';

export const map = <T, U>(option: Option<T>, fn: (value: T) => U): Option<U> =>
  isSome(option) ? Some(fn(option.value)) : None;


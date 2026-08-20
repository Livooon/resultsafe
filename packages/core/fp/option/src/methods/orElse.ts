import type { Option } from '@resultsafe/core-fp-option-shared';
import { isNone } from '../guards/isNone.js';

export const orElse = <T>(option: Option<T>, fn: () => Option<T>): Option<T> =>
  isNone(option) ? fn() : option;


import type { Option } from '@resultsafe/core-fp-option-shared';
import { isSome } from '../guards/isSome.js';

export const unwrapOr = <T>(option: Option<T>, defaultValue: T): T =>
  isSome(option) ? option.value : defaultValue;


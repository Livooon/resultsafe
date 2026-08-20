import type { Option } from '@resultsafe/core-fp-option-shared';
import { isSome } from '../guards/isSome.js';

export const unwrapOrElse = <T>(option: Option<T>, fn: () => T): T =>
  isSome(option) ? option.value : fn();


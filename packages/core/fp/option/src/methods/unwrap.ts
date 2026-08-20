import type { Option } from '@resultsafe/core-fp-option-shared';
import { isSome } from '../guards/isSome.js';

export const unwrap = <T>(option: Option<T>): T => {
  if (isSome(option)) {
    return option.value;
  }
  throw new Error('Called unwrap on a None value');
};


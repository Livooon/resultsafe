import type { Option } from '@resultsafe/core-fp-option-shared';
import { isSome } from '../guards/isSome.js';

export const expect = <T>(option: Option<T>, msg: string): T => {
  if (isSome(option)) {
    return option.value;
  }
  throw new Error(msg);
};


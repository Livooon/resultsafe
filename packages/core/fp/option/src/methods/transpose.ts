import { type Option } from '@resultsafe/core-fp-option-shared';
import {
  Err,
  Ok,
  type Result,
  type ResultLike,
} from '@resultsafe/core-fp-result';
import { None, Some } from '../constructors/index.js';

export const transpose = <T, E>(
  option: Option<ResultLike<T, E>>,
): Result<Option<T>, E> => {
  if (option.some === true) {
    const res = option.value;
    return res.ok ? Ok(Some(res.value)) : Err(res.error);
  }
  return Ok(None);
};


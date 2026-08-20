import {
  createErr,
  createOk,
  hydrateResultValue,
} from '../internal/resultValue.js';
import type { Result, ResultData, ResultLike } from '../types/core/index.js';

/**
 * Projects a Result-like value to newly allocated, frozen branch data.
 * @returns Data with no Result methods.
 * @example `toResultData(Ok(1)) // { ok: true, value: 1 }`
 * @since 0.3.0
 */
export const toResultData = <T, E>(
  result: ResultLike<T, E>,
): ResultData<T, E> =>
  result.ok === true
    ? Object.freeze({ ok: true, value: result.value })
    : Object.freeze({ ok: false, error: result.error });

/**
 * Creates a canonical runtime Result from data-only transport input.
 * @returns A newly allocated frozen methodful Result.
 * @example `fromResultData({ ok: true, value: 1 }).unwrap() // 1`
 * @since 0.3.0
 */
export const fromResultData = <T, E>(data: ResultData<T, E>): Result<T, E> =>
  data.ok === true ? createOk(data.value) : createErr(data.error);

/**
 * Canonicalizes Result data or a runtime wrapper from any package copy.
 * @returns The local wrapper unchanged or a new local canonical wrapper.
 * @example `hydrateResult({ ok: true, value: 1 }).unwrap() // 1`
 * @since 0.3.0
 */
export const hydrateResult = <T, E>(result: ResultLike<T, E>): Result<T, E> =>
  hydrateResultValue(result);

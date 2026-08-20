import type { Err } from '../../constructors/Err.js';
import type { Ok } from '../../constructors/Ok.js';
import type { Option } from './Option.js';
import type { Result } from './Result.js';
import type { ResultData } from './ResultData.js';
import type { ResultLike } from './ResultLike.js';

/**
 * Instance operations available on every canonical Result value.
 *
 * @typeParam T - The success payload type.
 * @typeParam E - The error payload type.
 * @since 0.3.0
 * @example
 * ```ts
 * const value = Ok(1).map((number) => number + 1).unwrap();
 * ```
 * @public
 */
export interface ResultMethods<T, E> {
  isErr(): this is Err<E>;
  isErrAnd<F extends E>(predicate: (error: E) => error is F): this is Err<F>;
  isErrAnd(predicate: (error: E) => boolean): this is Err<E>;
  isOk(): this is Ok<T>;
  isOkAnd<U extends T>(predicate: (value: T) => value is U): this is Ok<U>;
  isOkAnd(predicate: (value: T) => boolean): this is Ok<T>;
  andThen<U, F>(fn: (value: T) => ResultLike<U, F>): Result<U, E | F>;
  err(): Option<E>;
  expect(msg: string): T;
  expectErr(msg: string): E;
  flatten<U, F>(this: Result<Result<U, F>, F>): Result<U, F>;
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapErr<F>(fn: (error: E) => F): Result<T, F>;
  match<A, B>(okFn: (value: T) => A, errFn: (error: E) => B): A | B;
  toOption(): Option<T>;
  orElse<F>(fn: (error: E) => ResultLike<T, F>): Result<T, F>;
  tap(fn: (value: T) => void): this;
  tapErr(fn: (error: E) => void): this;
  toResultData(): ResultData<T, E>;
  transpose<U, F>(this: Result<Option<U>, F>): Option<Result<U, F>>;
  unwrap(): T;
  unwrapErr(): E;
  unwrapOr<U>(defaultValue: U): T | U;
  unwrapOrElse<U>(fn: (error: E) => U): T | U;
}

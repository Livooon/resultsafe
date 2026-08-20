import type { Err } from '../constructors/Err.js';
import type { Ok } from '../constructors/Ok.js';
import { ResultExtractionError } from '../errors/ResultExtractionError.js';
import type {
  Option,
  Result,
  ResultData,
  ResultLike,
} from '../types/core/index.js';
import { None, Some } from './option.js';

function isErr<T, E>(this: Result<T, E>): this is Err<E> {
  return this.ok === false;
}

function isErrAnd<T, E>(
  this: Result<T, E>,
  predicate: (error: E) => boolean,
): this is Err<E> {
  return this.ok === false && predicate(this.error);
}

function isOk<T, E>(this: Result<T, E>): this is Ok<T> {
  return this.ok === true;
}

function isOkAnd<T, E>(
  this: Result<T, E>,
  predicate: (value: T) => boolean,
): this is Ok<T> {
  return this.ok === true && predicate(this.value);
}

function andThen<T, U, E, F>(
  this: Result<T, E>,
  fn: (value: T) => ResultLike<U, F>,
): Result<U, E | F> {
  return this.ok === true
    ? hydrateResultValue(fn(this.value))
    : (this as unknown as Result<U, E | F>);
}

function err<T, E>(this: Result<T, E>): Option<E> {
  return this.ok === false ? Some(this.error) : None;
}

function expect<T, E>(this: Result<T, E>, msg: string): T {
  if (this.ok === true) return this.value;
  throw new ResultExtractionError(msg, this.error);
}

function expectErr<T, E>(this: Result<T, E>, msg: string): E {
  if (this.ok === false) return this.error;
  throw new ResultExtractionError(msg, this.value);
}

function flatten<T, E>(this: Result<Result<T, E>, E>): Result<T, E> {
  return this.ok === true ? this.value : (this as unknown as Result<T, E>);
}

function map<T, U, E>(this: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return this.ok === true
    ? createOk<U>(fn(this.value))
    : (this as unknown as Result<U, E>);
}

function mapErr<T, E, F>(
  this: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return this.ok === false
    ? createErr<F>(fn(this.error))
    : (this as unknown as Result<T, F>);
}

function match<T, E, A, B>(
  this: Result<T, E>,
  okFn: (value: T) => A,
  errFn: (error: E) => B,
): A | B {
  return this.ok === true ? okFn(this.value) : errFn(this.error);
}

function toOption<T, E>(this: Result<T, E>): Option<T> {
  return this.ok === true ? Some(this.value) : None;
}

function orElse<T, E, F>(
  this: Result<T, E>,
  fn: (error: E) => ResultLike<T, F>,
): Result<T, F> {
  return this.ok === false
    ? hydrateResultValue(fn(this.error))
    : (this as unknown as Result<T, F>);
}

function tap<T, E>(this: Result<T, E>, fn: (value: T) => void): Result<T, E> {
  if (this.ok === true) fn(this.value);
  return this;
}

function tapErr<T, E>(
  this: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> {
  if (this.ok === false) fn(this.error);
  return this;
}

function toResultData<T, E>(this: Result<T, E>): ResultData<T, E> {
  return this.ok === true
    ? Object.freeze({ ok: true, value: this.value })
    : Object.freeze({ ok: false, error: this.error });
}

function transpose<T, E>(this: Result<Option<T>, E>): Option<Result<T, E>> {
  if (this.ok === false) return Some(createErr<E>(this.error));
  return this.value.some === true ? Some(createOk<T>(this.value.value)) : None;
}

function unwrap<T, E>(this: Result<T, E>): T {
  if (this.ok === true) return this.value;
  throw new ResultExtractionError('Called unwrap on an Err value', this.error);
}

function unwrapErr<T, E>(this: Result<T, E>): E {
  if (this.ok === false) return this.error;
  throw new ResultExtractionError(
    'Called unwrapErr on an Ok value',
    this.value,
  );
}

function unwrapOr<T, E, U>(this: Result<T, E>, defaultValue: U): T | U {
  return this.ok === true ? this.value : defaultValue;
}

function unwrapOrElse<T, E, U>(this: Result<T, E>, fn: (error: E) => U): T | U {
  return this.ok === true ? this.value : fn(this.error);
}

const resultPrototype = Object.freeze(
  Object.defineProperties(
    {},
    {
      isErr: { value: isErr },
      isErrAnd: { value: isErrAnd },
      isOk: { value: isOk },
      isOkAnd: { value: isOkAnd },
      andThen: { value: andThen },
      err: { value: err },
      expect: { value: expect },
      expectErr: { value: expectErr },
      flatten: { value: flatten },
      map: { value: map },
      mapErr: { value: mapErr },
      match: { value: match },
      toOption: { value: toOption },
      orElse: { value: orElse },
      tap: { value: tap },
      tapErr: { value: tapErr },
      toResultData: { value: toResultData },
      transpose: { value: transpose },
      unwrap: { value: unwrap },
      unwrapErr: { value: unwrapErr },
      unwrapOr: { value: unwrapOr },
      unwrapOrElse: { value: unwrapOrElse },
    },
  ),
);

const withPrototype = <T extends object>(fields: T): T =>
  Object.assign(Object.create(resultPrototype) as T, fields);

/** Creates the canonical frozen Ok wrapper. @internal */
export const createOk = <T>(value: T): Ok<T> =>
  Object.freeze(withPrototype({ ok: true, value })) as Ok<T>;

/** Creates the canonical frozen Err wrapper. @internal */
export const createErr = <E>(error: E): Err<E> =>
  Object.freeze(withPrototype({ ok: false, error })) as Err<E>;

/** Returns true only for wrappers created by this installed package copy. */
export const isLocalResult = <T, E>(
  result: ResultLike<T, E>,
): result is Result<T, E> => Object.getPrototypeOf(result) === resultPrototype;

/** Canonicalizes transport data or a wrapper from another package copy. */
export const hydrateResultValue = <T, E>(
  result: ResultLike<T, E>,
): Result<T, E> => {
  if (isLocalResult(result)) return result;
  return result.ok === true ? createOk(result.value) : createErr(result.error);
};

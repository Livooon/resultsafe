import { describe, expect, it, vi } from 'vitest';

import {
  andThen,
  err,
  Err,
  expect as expectResult,
  expectErr,
  flatten,
  isErr,
  isErrAnd,
  isOk,
  isOkAnd,
  map,
  mapErr,
  match,
  ok,
  Ok,
  orElse,
  ResultExtractionError,
  tap,
  tapErr,
  transpose,
  unwrap,
  unwrapErr,
  unwrapOr,
  unwrapOrElse,
} from '../../../src/index.js';

const methodNames = [
  'isErr',
  'isErrAnd',
  'isOk',
  'isOkAnd',
  'andThen',
  'err',
  'expect',
  'expectErr',
  'flatten',
  'map',
  'mapErr',
  'match',
  'toOption',
  'orElse',
  'tap',
  'tapErr',
  'toResultData',
  'transpose',
  'unwrap',
  'unwrapErr',
  'unwrapOr',
  'unwrapOrElse',
] as const;

describe('Result instance methods', () => {
  it('uses one non-enumerable surface and preserves exact frozen data shape', () => {
    const value = { id: 1 };
    const error = { code: 'failure' };
    const success = Ok(value);
    const failure = Err(error);
    const prototype = Object.getPrototypeOf(success) as object;

    expect(Object.getPrototypeOf(failure)).toBe(prototype);
    expect(Object.keys(success)).toEqual(['ok', 'value']);
    expect(Object.keys(failure)).toEqual(['ok', 'error']);
    expect(Reflect.ownKeys(success)).toEqual(['ok', 'value']);
    expect(Reflect.ownKeys(failure)).toEqual(['ok', 'error']);
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(failure)).toBe(true);
    expect(success.value).toBe(value);
    expect(failure.error).toBe(error);
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    expect(Object.keys(prototype)).toEqual([]);
    expect(Object.getOwnPropertyNames(prototype)).toEqual(methodNames);
    for (const name of methodNames) {
      expect(Object.getOwnPropertyDescriptor(prototype, name)?.enumerable).toBe(
        false,
      );
    }
  });

  it('matches guard functions and invokes predicates exactly when selected', () => {
    const success = Ok<number, string>(2);
    const failure = Err<string, number>('failure');
    const okPredicate = vi.fn((value: number) => value === 2);
    const errPredicate = vi.fn((error: string) => error === 'failure');

    expect(success.isOk()).toBe(isOk(success));
    expect(success.isErr()).toBe(isErr(success));
    expect(failure.isOk()).toBe(isOk(failure));
    expect(failure.isErr()).toBe(isErr(failure));
    expect(success.isOkAnd(okPredicate)).toBe(isOkAnd(success, okPredicate));
    expect(failure.isOkAnd(okPredicate)).toBe(isOkAnd(failure, okPredicate));
    expect(failure.isErrAnd(errPredicate)).toBe(
      isErrAnd(failure, errPredicate),
    );
    expect(success.isErrAnd(errPredicate)).toBe(
      isErrAnd(success, errPredicate),
    );
    expect(okPredicate).toHaveBeenCalledTimes(2);
    expect(errPredicate).toHaveBeenCalledTimes(2);
  });

  it('matches transforming functions, callback counts, and pass-through identity', () => {
    const success = Ok<number, string>(2);
    const failure = Err<string, number>('failure');
    const mapFn = vi.fn((value: number) => value * 2);
    const mapErrFn = vi.fn((error: string) => error.length);
    const chainFn = vi.fn((value: number) => Ok<number, string>(value + 1));
    const recoverFn = vi.fn((error: string) =>
      Ok<number, number>(error.length),
    );

    expect(success.map(mapFn)).toEqual(map(success, mapFn));
    expect(failure.map(mapFn)).toBe(map(failure, mapFn));
    expect(failure.mapErr(mapErrFn)).toEqual(mapErr(failure, mapErrFn));
    expect(success.mapErr(mapErrFn)).toBe(mapErr(success, mapErrFn));
    expect(success.andThen(chainFn)).toEqual(andThen(success, chainFn));
    expect(failure.andThen(chainFn)).toBe(andThen(failure, chainFn));
    expect(failure.orElse(recoverFn)).toEqual(orElse(failure, recoverFn));
    expect(success.orElse(recoverFn)).toBe(orElse(success, recoverFn));
    expect(mapFn).toHaveBeenCalledTimes(2);
    expect(mapErrFn).toHaveBeenCalledTimes(2);
    expect(chainFn).toHaveBeenCalledTimes(2);
    expect(recoverFn).toHaveBeenCalledTimes(2);
  });

  it('free and instance transformations create canonical wrappers', () => {
    const mappedPayload = { id: 2 };
    const mappedError = { code: 'mapped' };
    const mappedByMethod = Ok<number, string>(1).map(() => mappedPayload);
    const mappedByFunction = map(Ok<number, string>(1), () => mappedPayload);
    const errorByMethod = Err<string, number>('failure').mapErr(
      () => mappedError,
    );
    const errorByFunction = mapErr(Err<string, number>('failure'), () =>
      mappedError,
    );

    for (const result of [mappedByMethod, mappedByFunction]) {
      expect(Object.keys(result)).toEqual(['ok', 'value']);
      expect(Object.isFrozen(result)).toBe(true);
      expect(result.ok && result.value).toBe(mappedPayload);
    }
    for (const result of [errorByMethod, errorByFunction]) {
      expect(Object.keys(result)).toEqual(['ok', 'error']);
      expect(Object.isFrozen(result)).toBe(true);
      expect(!result.ok && result.error).toBe(mappedError);
    }
  });

  it('matches extraction, matching, flattening, and transposition functions', () => {
    const payload = { id: 1 };
    const problem = { code: 'failure' };
    const success = Ok<typeof payload, typeof problem>(payload);
    const failure = Err<typeof problem, typeof payload>(problem);
    const inner = Ok<number, string>(3);
    const outer = Ok<typeof inner, string>(inner);
    const some = Ok<{ some: true; value: typeof payload }, typeof problem>({
      some: true,
      value: payload,
    });

    expect(success.toOption()).toEqual(ok(success));
    expect(failure.toOption()).toBe(ok(failure));
    expect(success.err()).toBe(err(success));
    expect(failure.err()).toEqual(err(failure));
    expect(success.unwrap()).toBe(unwrap(success));
    expect(failure.unwrapErr()).toBe(unwrapErr(failure));
    expect(success.expect('message')).toBe(expectResult(success, 'message'));
    expect(failure.expectErr('message')).toBe(expectErr(failure, 'message'));
    expect(outer.flatten()).toBe(flatten(outer));
    expect(some.transpose()).toEqual(transpose(some));
    expect(some.transpose().some && some.transpose().value.value).toBe(payload);
    expect(
      success.match(
        (value) => value,
        () => problem,
      ),
    ).toBe(
      match(
        success,
        (value) => value,
        () => problem,
      ),
    );
    expect(
      failure.match(
        () => payload,
        (error) => error,
      ),
    ).toBe(
      match(
        failure,
        () => payload,
        (error) => error,
      ),
    );
  });

  it('matches effects, fallbacks, and callback counts', () => {
    const success = Ok<number, string>(2);
    const failure = Err<string, number>('failure');
    const successEffect = vi.fn<(value: number) => void>();
    const errorEffect = vi.fn<(error: string) => void>();
    const fallback = vi.fn((error: string) => error.length);

    expect(success.tap(successEffect)).toBe(tap(success, successEffect));
    expect(failure.tap(successEffect)).toBe(tap(failure, successEffect));
    expect(failure.tapErr(errorEffect)).toBe(tapErr(failure, errorEffect));
    expect(success.tapErr(errorEffect)).toBe(tapErr(success, errorEffect));
    expect(success.unwrapOr(false)).toBe(unwrapOr(success, false));
    expect(failure.unwrapOr(false)).toBe(unwrapOr(failure, false));
    expect(success.unwrapOrElse(fallback)).toBe(
      unwrapOrElse(success, fallback),
    );
    expect(failure.unwrapOrElse(fallback)).toBe(
      unwrapOrElse(failure, fallback),
    );
    expect(successEffect).toHaveBeenCalledTimes(2);
    expect(errorEffect).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it('throws equivalent extraction errors without changing payload identity', () => {
    const payload = { id: 1 };
    const problem = { code: 'failure' };
    const success = Ok<typeof payload, typeof problem>(payload);
    const failure = Err<typeof problem, typeof payload>(problem);

    const calls = [
      () => failure.unwrap(),
      () => unwrap(failure),
      () => success.unwrapErr(),
      () => unwrapErr(success),
      () => failure.expect('expected success'),
      () => expectResult(failure, 'expected success'),
      () => success.expectErr('expected failure'),
      () => expectErr(success, 'expected failure'),
    ];

    for (const call of calls) {
      try {
        call();
        throw new Error('Expected extraction to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ResultExtractionError);
        expect(
          (error as Error).cause === payload ||
            (error as Error).cause === problem,
        ).toBe(true);
      }
    }
  });
});

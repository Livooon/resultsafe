import { describe, expect, it, vi } from 'vitest';

import {
  Cause,
  CauseDie,
  CauseEmpty,
  CauseFail,
  CauseInterrupt,
  CauseParallel,
  CauseSequential,
  Err,
  Exit,
  ExitFailure,
  ExitSuccess,
  Failure,
  isCause,
  isExit,
  matchCause,
  matchExit,
  Ok,
  exitToResult,
  exitToResultCollapsed,
  resultToExit,
} from '../../../src/index.js';

const failure = Failure({
  schema_version: '1.0.0',
  code: 'urn:test:failure',
});

describe('Cause', () => {
  it('constructs and shallow-freezes every structural variant', () => {
    const error = { reason: 'typed' };
    const fail = CauseFail(error);
    const nodes = [
      CauseEmpty(),
      fail,
      CauseDie(failure),
      CauseInterrupt(failure),
      CauseSequential(fail, Cause.Empty()),
      CauseParallel(Cause.Fail(error), Cause.Die(failure)),
    ];

    expect(nodes.map((node) => node._tag)).toEqual([
      'Empty',
      'Fail',
      'Die',
      'Interrupt',
      'Sequential',
      'Parallel',
    ]);
    expect(nodes.every(Object.isFrozen)).toBe(true);
    expect(fail.error).toBe(error);
    expect(Object.isFrozen(error)).toBe(false);
    expect(CauseDie(failure).failure).toBe(failure);
  });

  it('validates bounded graphs, rejecting cycles and excessive depth or nodes', () => {
    const cycle: { _tag: string; left?: unknown; right?: unknown } = {
      _tag: 'Sequential',
    };
    cycle.left = CauseEmpty();
    cycle.right = cycle;

    expect(isCause(CauseParallel(CauseEmpty(), CauseFail('x')))).toBe(true);
    expect(isCause(cycle)).toBe(false);
    expect(
      isCause(CauseSequential(CauseEmpty(), CauseEmpty()), {
        max_depth: 32,
        max_nodes: 2,
      }),
    ).toBe(false);

    let deep = CauseEmpty();
    for (let index = 0; index < 33; index += 1)
      deep = CauseSequential(deep, CauseEmpty());
    expect(isCause(deep)).toBe(false);
  });

  it('uses root depth zero and occurrence-based node limits', () => {
    const atDepth = (depth: number) => {
      let cause = CauseEmpty();
      for (let index = 0; index < depth; index += 1)
        cause = CauseSequential(cause, CauseEmpty());
      return cause;
    };

    expect(isCause(CauseEmpty(), { max_depth: 0, max_nodes: 1 })).toBe(true);
    expect(
      isCause(CauseSequential(CauseEmpty(), CauseEmpty()), {
        max_depth: 0,
        max_nodes: 3,
      }),
    ).toBe(false);
    expect(isCause(atDepth(31), { max_depth: 31, max_nodes: 63 })).toBe(true);
    expect(isCause(atDepth(32), { max_depth: 32, max_nodes: 65 })).toBe(true);
    expect(isCause(atDepth(33), { max_depth: 32, max_nodes: 67 })).toBe(false);

    const shared = CauseParallel(CauseFail('shared'), CauseEmpty());
    const graph = CauseSequential(shared, shared);
    expect(isCause(graph, { max_depth: 2, max_nodes: 7 })).toBe(true);
    expect(isCause(graph, { max_depth: 2, max_nodes: 6 })).toBe(false);
  });

  it('validates typed errors only when a payload predicate is supplied', () => {
    const isString = (value: unknown): value is string =>
      typeof value === 'string';
    const predicate = vi.fn(isString);
    const cause = CauseParallel(CauseFail('left'), CauseFail('right'));

    expect(isCause(cause, predicate)).toBe(true);
    expect(predicate).toHaveBeenCalledTimes(2);
    expect(isCause(CauseFail(1), isString)).toBe(false);
    expect(
      isCause(CauseFail('limited'), undefined, isString),
    ).toBe(true);
    expect(isCause(CauseDie(failure), isString)).toBe(true);
  });

  it('requires exact own data fields and rejects malformed values safely', () => {
    const symbolExtra = { _tag: 'Empty', [Symbol('extra')]: true };
    const hiddenExtra = { _tag: 'Empty' };
    Object.defineProperty(hiddenExtra, 'extra', { value: true });
    const accessor = {};
    Object.defineProperty(accessor, '_tag', {
      enumerable: true,
      get: () => 'Empty',
    });
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('hostile');
        },
      },
    );
    class EmptyLike {
      readonly _tag = 'Empty';
    }

    expect(isCause(symbolExtra)).toBe(false);
    expect(isCause(hiddenExtra)).toBe(false);
    expect(isCause(accessor)).toBe(false);
    expect(isCause(hostile)).toBe(false);
    expect(isCause(new EmptyLike())).toBe(false);
    expect(isCause(new Date())).toBe(false);
    expect(isCause({ _tag: 'Fail' })).toBe(false);
    expect(isCause({ _tag: 'Empty', error: 'extra' })).toBe(false);
  });

  it('rejects malformed Failure payloads in Die and Interrupt nodes', () => {
    const accessorFailure = { schema_version: '1.0.0' } as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessorFailure, 'code', {
      enumerable: true,
      get: () => 'urn:test:accessor',
    });
    const symbolicFailure = {
      schema_version: '1.0.0',
      code: 'urn:test:symbol',
      [Symbol('extra')]: true,
    };
    const hostileFailure = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('hostile');
        },
      },
    );

    expect(isCause({ _tag: 'Die', failure: accessorFailure })).toBe(false);
    expect(isCause({ _tag: 'Interrupt', failure: symbolicFailure })).toBe(
      false,
    );
    expect(isCause({ _tag: 'Die', failure: hostileFailure })).toBe(false);
    expect(
      isCause({
        _tag: 'Die',
        failure: { schema_version: '1.0.0', code: 'not-an-uri' },
      }),
    ).toBe(false);
  });

  it('matches all node variants exhaustively', () => {
    const handlers = {
      Empty: () => 'empty',
      Fail: (error: string) => error,
      Die: () => 'die',
      Interrupt: () => 'interrupt',
      Sequential: () => 'sequential',
      Parallel: () => 'parallel',
    };

    expect([
      matchCause(CauseEmpty(), handlers),
      matchCause(CauseFail('typed'), handlers),
      matchCause(CauseDie(failure), handlers),
      matchCause(CauseInterrupt(failure), handlers),
      matchCause(CauseSequential(CauseEmpty(), CauseEmpty()), handlers),
      matchCause(CauseParallel(CauseEmpty(), CauseEmpty()), handlers),
    ]).toEqual([
      'empty',
      'typed',
      'die',
      'interrupt',
      'sequential',
      'parallel',
    ]);
  });
});

describe('Exit', () => {
  it('freezes only Exit structure and permits Empty failure', () => {
    const value = { answer: 42 };
    const success = Exit.Success(value);
    const failed = ExitFailure(Cause.Empty());

    expect(success).toEqual({ _tag: 'Success', value });
    expect(failed).toEqual({ _tag: 'Failure', cause: { _tag: 'Empty' } });
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
    expect(success.value).toBe(value);
    expect(isExit(success)).toBe(true);
    expect(isExit(failed)).toBe(true);
  });

  it('matches both variants', () => {
    expect(
      matchExit(ExitSuccess(1), {
        Success: (value) => value + 1,
        Failure: () => 0,
      }),
    ).toBe(2);
    expect(
      matchExit(Exit.Failure(CauseFail('bad')), {
        Success: () => 'ok',
        Failure: (cause) => cause._tag,
      }),
    ).toBe('Fail');
  });

  it('validates exact structure and both typed payload channels', () => {
    const isNumber = (value: unknown): value is number =>
      typeof value === 'number';
    const isString = (value: unknown): value is string =>
      typeof value === 'string';
    const successPredicate = vi.fn(isNumber);
    const errorPredicate = vi.fn(isString);

    expect(isExit(ExitSuccess(1), successPredicate, errorPredicate)).toBe(true);
    expect(successPredicate).toHaveBeenCalledWith(1);
    expect(errorPredicate).not.toHaveBeenCalled();
    successPredicate.mockClear();
    expect(
      isExit(
        ExitFailure(CauseFail('bad')),
        successPredicate,
        errorPredicate,
      ),
    ).toBe(true);
    expect(successPredicate).not.toHaveBeenCalled();
    expect(errorPredicate).toHaveBeenCalledWith('bad');
    expect(isExit(ExitSuccess('wrong'), isNumber, isString)).toBe(false);
    expect(isExit(ExitFailure(CauseFail(1)), isNumber, isString)).toBe(false);
    expect(
      isExit(ExitSuccess(2), undefined, isNumber, isString),
    ).toBe(true);

    const symbolExtra = { _tag: 'Success', value: 1, [Symbol()]: true };
    const hiddenExtra = { _tag: 'Failure', cause: CauseEmpty() };
    Object.defineProperty(hiddenExtra, 'extra', { value: true });
    const accessor = { value: 1 };
    Object.defineProperty(accessor, '_tag', {
      enumerable: true,
      get: () => 'Success',
    });
    const hostile = new Proxy({}, { ownKeys: () => ['_tag'] });
    class SuccessLike {
      readonly _tag = 'Success';
      readonly value = 1;
    }

    expect(isExit(symbolExtra)).toBe(false);
    expect(isExit(hiddenExtra)).toBe(false);
    expect(isExit(accessor)).toBe(false);
    expect(isExit(hostile)).toBe(false);
    expect(isExit(new SuccessLike())).toBe(false);
    expect(isExit({ _tag: 'Failure', cause: { _tag: 'Unknown' } })).toBe(false);
  });

  it('projects Result losslessly unless an explicit collapse policy is supplied', () => {
    const value = { answer: 42 };
    const error = { code: 'bad' };
    const success = resultToExit(Ok<typeof value, typeof error>(value));
    const failed = resultToExit(Err<typeof error, typeof value>(error));

    expect(success).toEqual({ _tag: 'Success', value });
    expect(failed).toEqual({
      _tag: 'Failure',
      cause: { _tag: 'Fail', error },
    });
    expect(exitToResult(success).value).toBe(value);
    const lossless = exitToResult(failed);
    expect(lossless.ok).toBe(false);
    if (!lossless.ok) expect(lossless.error).toBe(failed.cause);

    const collapse = vi.fn(() => error);
    const collapsed = exitToResultCollapsed(ExitFailure(CauseEmpty()), collapse);
    expect(collapsed).toEqual(expect.objectContaining({ ok: false, error }));
    expect(collapse).toHaveBeenCalledWith({ _tag: 'Empty' });

    const successCollapse = vi.fn(() => ({ message: 'unused' }));
    const unchanged = exitToResultCollapsed(success, successCollapse);
    expect(unchanged.value).toBe(value);
    expect(successCollapse).not.toHaveBeenCalled();

    const distinct = { message: 'collapsed' };
    const distinctCollapse = vi.fn(() => distinct);
    const distinctResult = exitToResultCollapsed(failed, distinctCollapse);
    expect(distinctResult).toEqual(
      expect.objectContaining({ ok: false, error: distinct }),
    );
    expect(distinctCollapse).toHaveBeenCalledTimes(1);
    expect(distinctCollapse).toHaveBeenCalledWith(failed.cause);
  });
});

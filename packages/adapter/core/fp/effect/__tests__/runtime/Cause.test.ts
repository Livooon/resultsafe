import {
  CauseDie,
  CauseEmpty,
  CauseFail,
  CauseInterrupt,
  CauseParallel,
  CauseSequential,
  Failure,
} from '@resultsafe/core-fp-result';
import * as EffectCause from 'effect/Cause';
import * as FiberId from 'effect/FiberId';
import { describe, expect, it, vi } from 'vitest';

import {
  effectCauseToResultSafe,
  resultSafeCauseToEffect,
} from '../../src/Cause.js';

const defectFailure = Failure({
  schema_version: '1.0.0',
  code: 'urn:test:defect',
});
const interruptFailure = Failure({
  schema_version: '1.0.0',
  code: 'urn:test:interrupt',
});
const fiberId = FiberId.runtime(7, 1000);
const defect = new Error('boom');

describe('Cause adapters for effect 3.22.1', () => {
  it('converts every Effect variant and invokes explicit runtime mappings', () => {
    const defectToFailure = vi.fn(() => defectFailure);
    const fiberIdToFailure = vi.fn(() => interruptFailure);
    const source = EffectCause.parallel(
      EffectCause.sequential(EffectCause.fail('left'), EffectCause.die(defect)),
      EffectCause.sequential(
        EffectCause.interrupt(fiberId),
        EffectCause.empty,
      ),
    );

    expect(
      effectCauseToResultSafe(source, {
        defectToFailure,
        fiberIdToFailure,
      }),
    ).toEqual(
      CauseParallel(
        CauseSequential(CauseFail('left'), CauseDie(defectFailure)),
        CauseSequential(CauseInterrupt(interruptFailure), CauseEmpty()),
      ),
    );
    expect(defectToFailure).toHaveBeenCalledExactlyOnceWith(defect);
    expect(fiberIdToFailure).toHaveBeenCalledExactlyOnceWith(fiberId);
  });

  it('reconstructs every Effect variant without changing binary grouping or order', () => {
    const failureToDefect = vi.fn(() => defect);
    const failureToFiberId = vi.fn(() => fiberId);
    const source = CauseSequential(
      CauseParallel(CauseFail({ code: 1 }), CauseDie(defectFailure)),
      CauseParallel(CauseInterrupt(interruptFailure), CauseEmpty()),
    );

    const converted = resultSafeCauseToEffect(source, {
      failureToDefect,
      failureToFiberId,
    });

    expect(converted._tag).toBe('Sequential');
    if (converted._tag !== 'Sequential') throw new Error('unreachable');
    expect(converted.left._tag).toBe('Parallel');
    expect(converted.right._tag).toBe('Parallel');
    if (converted.left._tag !== 'Parallel') throw new Error('unreachable');
    if (converted.right._tag !== 'Parallel') throw new Error('unreachable');
    expect(converted.left.left).toMatchObject({
      _tag: 'Fail',
      error: { code: 1 },
    });
    expect(converted.left.right).toMatchObject({ _tag: 'Die', defect });
    expect(converted.right.left).toMatchObject({
      _tag: 'Interrupt',
      fiberId,
    });
    expect(converted.right.right._tag).toBe('Empty');
    expect(failureToDefect).toHaveBeenCalledExactlyOnceWith(defectFailure);
    expect(failureToFiberId).toHaveBeenCalledExactlyOnceWith(interruptFailure);
  });
});

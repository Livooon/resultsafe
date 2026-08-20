import {
  CauseEmpty,
  CauseFail,
  ExitFailure,
  ExitSuccess,
} from '@resultsafe/core-fp-result';
import * as EffectCause from 'effect/Cause';
import * as EffectExit from 'effect/Exit';
import * as FiberId from 'effect/FiberId';
import { describe, expect, it, vi } from 'vitest';

import {
  effectExitToResultSafe,
  resultSafeExitToEffect,
} from '../../src/Exit.js';

const unused = (): never => {
  throw new Error('mapping must not be called');
};

describe('Exit adapters for effect 3.22.1', () => {
  it('converts success in both directions without runtime mappings', () => {
    const mappings = {
      defectToFailure: vi.fn(unused),
      fiberIdToFailure: vi.fn(unused),
    };
    expect(effectExitToResultSafe(EffectExit.succeed(42), mappings)).toEqual(
      ExitSuccess(42),
    );
    expect(
      resultSafeExitToEffect(ExitSuccess(42), {
        failureToDefect: vi.fn(unused),
        failureToFiberId: vi.fn(unused),
      }),
    ).toMatchObject({ _tag: 'Success', value: 42 });
    expect(mappings.defectToFailure).not.toHaveBeenCalled();
    expect(mappings.fiberIdToFailure).not.toHaveBeenCalled();
  });

  it('converts typed failure exits while preserving generic E', () => {
    const effectExit: EffectExit.Exit<never, { readonly code: number }> =
      EffectExit.failCause(EffectCause.fail({ code: 7 }));
    expect(
      effectExitToResultSafe(effectExit, {
        defectToFailure: unused,
        fiberIdToFailure: unused,
      }),
    ).toEqual(ExitFailure(CauseFail({ code: 7 })));
  });

  it('represents Exit.Failure(Empty) exactly in Effect 3.22.1', () => {
    const effectExit = resultSafeExitToEffect(ExitFailure(CauseEmpty()), {
      failureToDefect: unused,
      failureToFiberId: unused,
    });

    expect(EffectExit.isFailure(effectExit)).toBe(true);
    if (!EffectExit.isFailure(effectExit)) throw new Error('unreachable');
    expect(effectExit.cause._tag).toBe('Empty');
    expect(
      effectExitToResultSafe(effectExit, {
        defectToFailure: unused,
        fiberIdToFailure: (_fiberId: FiberId.FiberId) => unused(),
      }),
    ).toEqual(ExitFailure(CauseEmpty()));
  });
});

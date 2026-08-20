import { describe, expect, it } from 'vitest';

import * as root from '../../../src/index.js';

describe('Cause and Exit root exports', () => {
  it('exports constructors, guards, matchers, and conversions', () => {
    expect(typeof root.Cause.Fail).toBe('function');
    expect(typeof root.Exit.Failure).toBe('function');
    expect(typeof root.isCause).toBe('function');
    expect(typeof root.isExit).toBe('function');
    expect(typeof root.matchCause).toBe('function');
    expect(typeof root.matchExit).toBe('function');
    expect(typeof root.resultToExit).toBe('function');
    expect(typeof root.exitToResult).toBe('function');
    expect(typeof root.exitToResultCollapsed).toBe('function');
  });
});

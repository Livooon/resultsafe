import { describe, expect, it } from 'vitest';

import * as constructorIndex from '../../../src/constructors/index.js';
import * as guardIndex from '../../../src/guards/index.js';
import * as rootIndex from '../../../src/index.js';
import * as methodIndex from '../../../src/methods/index.js';
import * as refinerIndex from '../../../src/refiners/index.js';

describe('module export indexes', () => {
  it('exposes constructor exports', () => {
    expect(typeof constructorIndex.Ok).toBe('function');
    expect(typeof constructorIndex.Err).toBe('function');
  });

  it('exposes guard exports', () => {
    expect(typeof guardIndex.isOk).toBe('function');
    expect(typeof guardIndex.isErr).toBe('function');
  });

  it('exposes method exports', () => {
    expect(typeof methodIndex.map).toBe('function');
    expect(typeof methodIndex.unwrap).toBe('function');
  });

  it('exposes refiner exports', () => {
    expect(typeof refinerIndex.refineResult).toBe('function');
    expect(typeof refinerIndex.matchVariant).toBe('function');
  });

  it('re-exports everything from root index', () => {
    expect(typeof rootIndex.Ok).toBe('function');
    expect(typeof rootIndex.map).toBe('function');
    expect(typeof rootIndex.refineResult).toBe('function');
    expect(typeof rootIndex.ResultExtractionError).toBe('function');
  });
});

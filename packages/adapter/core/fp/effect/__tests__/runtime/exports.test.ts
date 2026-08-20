import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as causeModule from '../../src/Cause.js';
import * as exitModule from '../../src/Exit.js';
import * as rootModule from '../../src/index.js';

const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);

describe('package exports', () => {
  it('exports the root and direct public modules', () => {
    expect(Object.keys(causeModule).sort()).toEqual([
      'effectCauseToResultSafe',
      'resultSafeCauseToEffect',
    ]);
    expect(Object.keys(exitModule).sort()).toEqual([
      'effectExitToResultSafe',
      'resultSafeExitToEffect',
    ]);
    expect(Object.keys(rootModule).sort()).toEqual([
      ...Object.keys(causeModule),
      ...Object.keys(exitModule),
    ].sort());

    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as {
      devDependencies: Record<string, string>;
      exports: Record<string, unknown>;
      peerDependencies: Record<string, string>;
      sideEffects: boolean;
    };
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './Cause', './Exit']);
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.peerDependencies['effect']).toBe('3.22.1');
    expect(manifest.devDependencies['effect']).toBe('3.22.1');

    const installedEffect = JSON.parse(
      readFileSync(require.resolve('effect/package.json'), 'utf8'),
    ) as { version: string };
    expect(installedEffect.version).toBe('3.22.1');
  });
});

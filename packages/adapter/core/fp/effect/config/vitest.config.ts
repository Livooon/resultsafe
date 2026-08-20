import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@resultsafe/core-fp-result': resolve(
        packageRoot,
        '../../../../core/fp/result/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/runtime/**/*.test.ts'],
  },
});

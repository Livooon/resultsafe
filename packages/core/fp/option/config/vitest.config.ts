import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@resultsafe/core-fp-option': resolve(packageRoot, 'src/index.ts'),
      '@resultsafe/core-fp-option-shared': resolve(
        packageRoot,
        '../option-shared/src/index.ts',
      ),
      '@resultsafe/core-fp-result': resolve(
        packageRoot,
        '../result/src/index.ts',
      ),
      '@resultsafe/core-fp-result-shared': resolve(
        packageRoot,
        '../result-shared/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});

// @resultsafe/core-fp-result/config/vite/vite.config.build.umd.ts
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import {
  getStringExternals,
  PATHS,
  SHARED_EXTERNALS,
  SHARED_OUTPUT_OPTIONS,
  SHARED_ROLLUP_OPTIONS,
} from './vite.config.shared.js';

// =============================================================================
// UMD BUILD CONFIGURATION
// =============================================================================
const umdConfig = defineConfig({
  build: {
    target: 'ES2022',
    sourcemap: true,
    minify: 'esbuild', // Минификация для UMD

    lib: {
      entry: resolve(__dirname, PATHS.entry),
      name: 'ResultsafeFpResult', // Глобальное имя
      formats: ['umd'],
      fileName: () => 'resultsafe-core-fp-result.umd.js',
    },

    outDir: resolve(__dirname, '../dist/umd'),

    rollupOptions: {
      external: SHARED_EXTERNALS,
      ...SHARED_ROLLUP_OPTIONS,

      output: {
        format: 'umd',
        name: 'ResultsafeFpResult',
        ...SHARED_OUTPUT_OPTIONS,

        globals: {
          '@resultsafe/core-fp-option': 'FpOption',
          '@resultsafe/core-fp-option-shared': 'FpOptionShared',
          '@resultsafe/core-fp-result-shared': 'FpResultShared',
          '@resultsafe/core-fp-union': 'FpUnion',
        },

        interop: 'esModule', // чтобы CommonJS-зависимости имели .default
      },
    },
  },

  esbuild: {
    minifyIdentifiers: false,
    minifySyntax: true,
    minifyWhitespace: true,
    keepNames: true,
    legalComments: 'none',
  },

  optimizeDeps: {
    exclude: getStringExternals(SHARED_EXTERNALS),
  },
});

export default umdConfig;

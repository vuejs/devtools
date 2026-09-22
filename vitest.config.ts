import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

function fromRoot(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@vue/devtools-kit/client',
        replacement: fromRoot('./packages/kit/src/client.ts'),
      },
      {
        find: '@vue/devtools-kit',
        replacement: fromRoot('./packages/kit/src/index.ts'),
      },
      {
        find: '@components',
        replacement: fromRoot('./packages/client/src/components'),
      },
    ],
  },
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        'tests/fixtures/**',
        'tests/helpers/**',
        'tests/smoke/**',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
    },
    environment: 'node',
    exclude: ['tests/smoke/**', '**/dist/**', '**/node_modules/**'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
    ],
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    unstubEnvs: true,
    unstubGlobals: true,
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/performance/**/*.test.ts'],
    testTimeout: 15_000,
  },
})

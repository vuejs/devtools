import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/smoke/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})

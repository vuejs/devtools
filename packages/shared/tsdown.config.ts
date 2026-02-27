import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  clean: true,
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
  hash: false,
  ignoreWatch: ['.turbo'],
})

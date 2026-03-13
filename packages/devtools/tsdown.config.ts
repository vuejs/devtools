import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/hook.ts',
  ],
  deps: {
    neverBundle: [
      'vue',
    ],
  },
  clean: true,
  format: ['esm', 'cjs'],
  fixedExtension: false,
  dts: true,
  shims: true,
  hash: false,
  ignoreWatch: ['.turbo'],
})

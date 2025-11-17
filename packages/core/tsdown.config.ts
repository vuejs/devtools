import { defineConfig } from 'tsdown'

export default defineConfig({
  entryPoints: [
    'src/index.ts',
  ],
  external: [
    'vue',
  ],
  noExternal: [
    'vite-hot-client',
  ],
  // clean: true,
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
  hash: false,
})

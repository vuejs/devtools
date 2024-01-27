import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/index.ts',
    'src/hook.ts',
  ],
  external: [
    'vue',
  ],
  clean: true,
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
})

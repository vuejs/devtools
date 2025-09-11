import { defineConfig } from 'tsdown'

export default defineConfig({
  entryPoints: [
    'src/index.ts',
  ],
  clean: true,
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
  noExternal: ['rfdc'],
})

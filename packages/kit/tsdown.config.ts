import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  sourcemap: false,
  clean: true,
})

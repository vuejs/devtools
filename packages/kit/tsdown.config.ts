import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  minify: true,
  sourcemap: false,
  clean: true,
})

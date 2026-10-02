import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  dts: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  clean: true,
})

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/index-node.ts'],
  dts: true,
  format: 'esm',
  sourcemap: false,
  clean: true,
})

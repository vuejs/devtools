import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/devframe.ts', 'src/node.ts', 'src/cli.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
})

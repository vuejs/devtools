import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/index-node.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  sourcemap: false,
  clean: true,
  outputOptions(outputOptions, format) {
    if (format === 'cjs') outputOptions.exports = 'named'
    return outputOptions
  },
})

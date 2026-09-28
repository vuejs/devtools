import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/dirs.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  outputOptions(outputOptions, format) {
    if (format === 'cjs') outputOptions.exports = 'named'
    return outputOptions
  },
})

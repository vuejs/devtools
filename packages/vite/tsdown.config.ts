import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/vite.ts',
  ],
  clean: true,
  format: ['esm', 'cjs'],
  dts: true,
})

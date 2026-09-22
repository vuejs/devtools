import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/client.ts'],
    dts: true,
    format: ['esm', 'cjs'],
    sourcemap: true,
    clean: true,
  },
})

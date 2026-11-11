import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/devtools-client.ts'],
  dts: true,
  format: ['esm'],
  clean: true,
})

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    'vite-devtools': 'src/devtools-client.ts',
    listeners: 'src/listeners.ts',
    overlay: 'src/overlay.ts',
  },
  dts: true,
  format: ['esm'],
  clean: true,
})

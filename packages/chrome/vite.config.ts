import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const packageDir = fileURLToPath(new URL('.', import.meta.url))
const workspaceDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: false,
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    rolldownOptions: {
      input: {
        'app/panel/devtools-panel': fileURLToPath(
          new URL('./app/panel/devtools-panel.html', import.meta.url),
        ),
      },
    },
    target: 'esnext',
  },
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@components': fileURLToPath(new URL('../client/src/components', import.meta.url)),
    },
    dedupe: ['vue'],
  },
  root: packageDir,
  server: {
    fs: {
      allow: [workspaceDir],
    },
  },
})

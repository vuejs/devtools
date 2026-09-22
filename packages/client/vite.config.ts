import vue from '@vitejs/plugin-vue'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@components': resolve(root, 'src/components'),
    },
  },
  build: {
    emptyOutDir: true,
    target: 'esnext',
  },
})

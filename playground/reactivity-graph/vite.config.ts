import vue from '@vitejs/plugin-vue'
import vueDevtools from 'vite-plugin-vue-devtools'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      vue: '@vue/runtime-dom',
    },
  },
  devtools: { apply: 'serve' },
  plugins: [vue(), UnoCSS(), vueDevtools()],
  server: {
    host: '127.0.0.1',
    port: 3002,
  },
})

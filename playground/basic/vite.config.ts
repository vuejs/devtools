import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import vueDevtools from 'vite-plugin-vue-devtools'
import { defineConfig } from 'vite'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [vue(), UnoCSS(), vueDevtools()],
})

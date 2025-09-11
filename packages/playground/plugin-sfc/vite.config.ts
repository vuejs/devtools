import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import inspect from 'vite-plugin-inspect'
import VueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VueDevTools(),
    inspect(),
  ],
  server: {
    port: 3000,
  },
})

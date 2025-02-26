import vue from '@vitejs/plugin-vue'
import uno from 'unocss/vite'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), uno()],
})

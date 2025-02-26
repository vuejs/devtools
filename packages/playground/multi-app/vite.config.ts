import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'

import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import VueDevtools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  plugins: [
    vue(),
    VueDevtools(),
    Unocss(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
    }),
  ],
  server: {
    port: 3001,
  },
})

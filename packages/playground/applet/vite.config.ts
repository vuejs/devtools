import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'

import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import VueDevtools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig({
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
      ignore: ['h'],
    }),
  ],
  server: {
    port: 3000,
  },
})

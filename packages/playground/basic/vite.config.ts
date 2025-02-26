import commonjs from '@rollup/plugin-commonjs'
import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vite'
import inspect from 'vite-plugin-inspect'
import VueDevTools from 'vite-plugin-vue-devtools'
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
    commonjs(),
    VueDevTools({
      // launchEditor: 'code',
    }),
    Unocss(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
      resolvers: [ElementPlusResolver()],
    }),
    inspect(),
  ],
  server: {
    port: 3000,
  },
})

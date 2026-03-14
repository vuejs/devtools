import { join, resolve } from 'node:path'
import Vue from '@vitejs/plugin-vue'
import VueJSX from '@vitejs/plugin-vue-jsx'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default {
  resolve: {
    alias: {
      '~/': `${resolve(__dirname)}/src/`,
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
  plugins: [
    {
      name: 'local-object-transform',
      transform: {
        order: 'post',
        async handler(code) {
          return `${code}\n/* Injected with object hook! */`
        },
      },
    },
    Vue(),
    VueJSX(),
    Components({
      dirs: ['./src/components'],
      dts: join(__dirname, 'components.d.ts'),
    }),
    Unocss(),
    AutoImport({
      dirs: [
        './src/utils',
        './src/composables',
        './src/constants',
      ],
      dts: join(__dirname, 'auto-imports.d.ts'),
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
    }),
  ],

}

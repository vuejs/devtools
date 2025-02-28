import Vue from '@vitejs/plugin-vue'
import * as CompilerSFC from '@vue/compiler-sfc'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    Vue({
      compiler: CompilerSFC,
    }),
    VueDevTools({
      componentInspector: false,
    }),
  ],
  optimizeDeps: {
    exclude: ['@vueuse/core'],
  },
})

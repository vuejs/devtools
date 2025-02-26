import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [Vue(), AutoImport({
    imports: [
      'vue',
      'vue-router',
      '@vueuse/core',
    ],
    dts: true,
  })],
  define: {
    __DEV__: true,
    __FEATURE_PROD_DEVTOOLS__: true,
  },
  test: {
    globals: true,
  },
})

import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import fse from 'fs-extra'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${resolve(__dirname)}/src/`,
    },
  },
  define: {
    'process.env': process.env,
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'devtoolsOverlay',
      fileName: () => 'devtools-overlay.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'devtools-overlay.[ext]',
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
  plugins: [
    vue(),
    {
      name: 'vite-plugin-copy-devtools-overlay',
      apply: 'build',
      enforce: 'post',
      async closeBundle() {
        // copy
        const overlayFile = resolve(__dirname, './dist')

        const overlayJsFile = resolve(__dirname, './dist/devtools-overlay.js')
        const overlayMjsFile = resolve(__dirname, './dist/devtools-overlay.mjs')

        fse.copyFileSync(overlayJsFile, overlayMjsFile)

        // Browser extension keep using js file
        fse.copySync(
          overlayFile,
          resolve(__dirname, '../chrome-extension/overlay'),
          {
            filter: (file) => {
              return !file.endsWith('.mjs')
            },
          },
        )

        // Vite using mjs file to skip some commonjs -> es6 plugins
        fse.copySync(
          overlayFile,
          resolve(__dirname, '../vite/src/overlay'),
          {
            filter: (file) => {
              return !file.endsWith('.js')
            },
          },
        )
      },
    },
  ],
})

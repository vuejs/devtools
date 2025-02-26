import { resolve } from 'node:path'
import fse from 'fs-extra'
import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.base.config'

export default defineConfig(mergeConfig(baseConfig, {

  define: {
    'process.env': process.env,
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist/devtools-client-lib',
    lib: {
      entry: resolve(__dirname, './src/index.ts'),
      name: 'devtoolsPanel',
      fileName: () => 'devtools-panel.js',
      formats: ['es'],
    },
    cssMinify: true,
    rollupOptions: {
      output: {
        assetFileNames: 'devtools-panel.[ext]',
        globals: {
          vue: 'Vue',
        },
      },
    },
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
    {
      name: 'vite-plugin-copy-devtools-client',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        // copy
        const clientFile = resolve(__dirname, './dist/devtools-client-lib')
        ;['../chrome-extension/client', '../firefox-extension/client', '../electron/client'].forEach((dir) => {
          fse.copySync(clientFile, resolve(__dirname, dir))
        })
      },
    },
  ],
}))

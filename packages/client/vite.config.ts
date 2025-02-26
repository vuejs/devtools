import { relative, resolve } from 'node:path'
import fse from 'fs-extra'
import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.base.config'

export default defineConfig(mergeConfig(baseConfig, {
  base: './',
  plugins: [
    {
      name: 'vite-plugin-copy-devtools-client-bundle',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        // copy
        const clientFile = resolve(__dirname, './dist')

        ;['../vite/client'].forEach((dir) => {
          fse.copySync(clientFile, resolve(__dirname, dir), { filter: (src) => {
            const relativePath = relative(clientFile, src)
            return !relativePath.includes('devtools-client-lib')
          } })
        })
      },
    },
  ],
  optimizeDeps: {
    exclude: [
      'vite-hot-client',
    ],
  },
  build: {
    target: 'esnext',
    minify: true, // 'esbuild',
    emptyOutDir: true,
  },
}))

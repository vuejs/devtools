/// <reference types="histoire" />

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { HstVue } from '@histoire/plugin-vue'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { dependencies, peerDependencies } from './package.json'

const IcIconDataPath = path.resolve(__dirname, './src/constants/ic-icons.ts')

export default defineConfig({
  plugins: [
    vue(),
    unocss(),
    dts({
      cleanVueFileName: true,
      include: ['src', 'theme'],
      outDir: 'dist/types',
    }),
    {
      // must mark as `@unocss-include`
      name: 'vue-devtools-next-ui-auto-gen-unocss-include',
      closeBundle() {
        ;['index.js', 'index.cjs'].forEach((file) => {
          const path = `./dist/${file}`
          const content = readFileSync(path, 'utf-8')
          writeFileSync(path, `// @unocss-include\n\n${content}`)
        })
      },
    },
  ],
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      external: [
        ...Object.keys(peerDependencies),
        ...Object.keys(dependencies),
        /^shiki/,
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
        /**
         * 1. unocss css snippets is optional
         * 2. vue sfc scoped css + node_modules css is necessary to be in the same chunk that imported by client
         */
        manualChunks(id) {
          // css #1
          if (id.includes('uno.css') || id.includes('@unocss/reset')) {
            return 'uno'
          }
          // css #2
          if ((id.includes('.vue') && id.includes('type=style'))
            || (id.includes('node_modules') && id.endsWith('.css'))) {
            return 'style'
          }

          // js code splitting
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          if (id === IcIconDataPath) {
            return 'ic-icons-data'
          }
        },
      },
    },
    lib: {
      entry: {
        index: 'src/index.ts',
        theme: 'theme/index.ts',
      },
      formats: ['es', 'cjs'],
    },
  },
  histoire: {
    setupCode: [
      'import "uno.css"',
    ],
    theme: {
      title: 'Vue-Devtools-Next-UI',
    },
    defaultStoryProps: {
      layout: {
        type: 'grid',
        width: 320,
      },
      responsiveDisabled: true,
      autoPropsDisabled: true,
    },
    plugins: [
      HstVue(),
    ],
  },
})

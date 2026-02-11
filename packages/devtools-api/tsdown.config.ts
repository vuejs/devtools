import { defineConfig } from 'tsdown'

const baseConfig = defineConfig({
  entry: 'src/index.ts',
  external: [
    'vue',
  ],
  shims: true,
  hash: false,
  ignoreWatch: ['.turbo'],
})

const esmBundlerConfig = defineConfig({
  ...baseConfig,
  format: 'esm',
  dts: true,
})

const cjsConfig = defineConfig({
  ...baseConfig,
  format: 'cjs',
  dts: true,
})

const iifeConfig = defineConfig({
  ...baseConfig,
  format: 'iife',
  noExternal: ['@vue/devtools-kit'],
  outputOptions: {
    name: 'VueDevToolsApi',
    entryFileNames: 'vue-devtools-api.global.js',
  },
})

const esmBrowserConfig = defineConfig({
  ...baseConfig,
  format: 'esm',
  noExternal: ['@vue/devtools-kit'],
  outputOptions: {
    entryFileNames: 'vue-devtools-api.esm-browser.js',
  },
})

export default [
  esmBundlerConfig,
  cjsConfig,
  iifeConfig,
  esmBrowserConfig,
]

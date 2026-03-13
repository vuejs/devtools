import { defineConfig } from 'tsdown'

const baseConfig = defineConfig({
  entry: 'src/index.ts',
  deps: {
    neverBundle: [
      'vue',
    ],
  },
  shims: true,
  hash: false,
  ignoreWatch: ['.turbo'],
})

const esmBundlerConfig = defineConfig({
  ...baseConfig,
  format: 'esm',
  fixedExtension: false,
  dts: true,
})

const cjsConfig = defineConfig({
  ...baseConfig,
  format: 'cjs',
  fixedExtension: false,
  dts: true,
})

const iifeConfig = defineConfig({
  ...baseConfig,
  format: 'iife',
  deps: {
    ...baseConfig.deps,
    alwaysBundle: ['@vue/devtools-kit'],
  },
  outputOptions: {
    name: 'VueDevToolsApi',
    entryFileNames: 'vue-devtools-api.global.js',
  },
})

const esmBrowserConfig = defineConfig({
  ...baseConfig,
  format: 'esm',
  deps: {
    ...baseConfig.deps,
    alwaysBundle: ['@vue/devtools-kit'],
  },
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

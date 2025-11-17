import { defineConfig } from 'tsdown'

const NO_EXTERNAL = ['@vue/devtools-core', '@vue/devtools-kit', '@vue/devtools-shared']
function createIIFEConfig(entry: string) {
  return {
    entry: [entry],
    clean: false,
    format: 'iife' as const,
    outputOptions: {
      entryFileNames: '[name].js',
    },
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: 'production',
      }),
      '__VUE_OPTIONS_API__': 'true',
      '__VUE_PROD_DEVTOOLS__': 'true',
    },
    noExternal: NO_EXTERNAL,
  }
}
export default defineConfig([{
  entry: [
    'src/*.ts',
    '!src/proxy.ts',
    '!src/prepare.ts',
    '!src/devtools-overlay.ts',
  ],
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: 'production',
    }),
    '__VUE_OPTIONS_API__': 'true',
    '__VUE_PROD_DEVTOOLS__': 'true',
  },
  clean: false,
  hash: false,
  noExternal: NO_EXTERNAL,
}, createIIFEConfig('src/proxy.ts'), createIIFEConfig('src/prepare.ts'), createIIFEConfig('src/devtools-overlay.ts')])

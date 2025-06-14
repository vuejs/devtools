import { defineConfig } from 'tsup'

export default defineConfig([{
  entryPoints: [
    'src/*.ts',
    '!src/devtools-panel.ts',
  ],
  esbuildOptions(options) {
    if (options.format === 'iife')
      options.outExtension = { '.js': '.js' }
  },
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: 'production',
    }),
    '__VUE_OPTIONS_API__': 'true',
    '__VUE_PROD_DEVTOOLS__': 'true',
  },
  clean: true,
  format: ['iife'],
  minify: true,
}, {
  entryPoints: [
    'src/devtools-panel.ts',
  ],
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: 'production',
    }),
    '__VUE_OPTIONS_API__': 'true',
    '__VUE_PROD_DEVTOOLS__': 'true',
  },
  clean: true,
  format: ['esm'],
  minify: true,
  noExternal: ['@vue/devtools-core', '@vue/devtools-kit', '@vue/devtools-shared'],
}])

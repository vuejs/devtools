import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  // Bundle Devframe code and types to avoid a runtime dependency.
  deps: {
    onlyBundle: ['devframe', 'nostics'],
    alwaysBundle: [/^devframe(?:\/.*)?$/],
  },
  dts: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  clean: true,
})

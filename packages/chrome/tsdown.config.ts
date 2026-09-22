import { defineConfig } from 'tsdown'

const define = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  __VUE_OPTIONS_API__: 'true',
  __VUE_PROD_DEVTOOLS__: 'true',
}

const bundled = [/^@vue\/devtools-kit(?:\/.*)?$/, /^devframe(?:\/.*)?$/]

function createIifeConfig(name: string, entry: string) {
  return {
    entry: {
      [name]: entry,
    },
    clean: false,
    define,
    deps: {
      alwaysBundle: bundled,
    },
    dts: false,
    format: 'iife' as const,
    globalName: 'VueDevtoolsChrome',
    hash: false,
    outputOptions: {
      codeSplitting: false,
      entryFileNames: '[name].js',
    },
    platform: 'browser' as const,
    target: 'esnext',
  }
}

export default defineConfig([
  {
    entry: {
      background: 'src/background/index.ts',
      'devtools-background': 'src/devtools/background.ts',
    },
    clean: true,
    define,
    deps: {
      alwaysBundle: bundled,
    },
    dts: false,
    format: 'esm',
    hash: false,
    platform: 'browser',
    sourcemap: false,
    target: 'esnext',
  },
  createIifeConfig('backend', 'src/content/backend.ts'),
  createIifeConfig('content-bridge', 'src/content/bridge.ts'),
  createIifeConfig('detector', 'src/content/detector.ts'),
])

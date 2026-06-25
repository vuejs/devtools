import { defineConfig } from 'unocss'

// @ts-expect-error config files are loaded directly by tsx in lint/UnoCSS.
import config from './packages/client/uno.config.ts'

export default defineConfig({
  ...config,
  configDeps: [
    './packages/client/uno.config.ts',
    './packages/ui/uno.config.ts',
  ],
})

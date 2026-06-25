import { defineConfig } from 'unocss'

import config from './packages/client/uno.config.ts'

export default defineConfig({
  ...config,
  configDeps: [
    './packages/client/uno.config.ts',
    './packages/ui/uno.config.ts',
  ],
})

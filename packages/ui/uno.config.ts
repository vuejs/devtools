import { defineConfig } from 'unocss'
// @ts-expect-error config files are loaded directly by tsx in CI.
import { unoConfig } from './theme/uno.config.ts'

export default defineConfig(unoConfig)

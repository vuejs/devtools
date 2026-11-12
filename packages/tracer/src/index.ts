import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import { tracerDevTools } from './devtools'
import { tracerTransform } from './transform'

export { tracerDevTools, tracerTransform }
export type { VueTracerOptions } from './options'

export function VueTracer(
  options: VueTracerOptions = {},
): (Plugin & Pick<PluginWithDevTools, 'devtools'>) | undefined {
  if (options.enabled === false) return
  return {
    ...tracerDevTools(options),
    ...tracerTransform(options),
  }
}

export default VueTracer

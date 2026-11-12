import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import type { Plugin } from 'vite'
import type { VueTracerOptions } from './options'
import { tracerDevTools } from './devtools'
import { createTracerTransforms, tracerTransform } from './transform'

export { tracerDevTools, tracerTransform }
export type { VueTracerOptions } from './options'

export function VueTracer(
  options: VueTracerOptions = {},
): (Plugin & Pick<PluginWithDevTools, 'devtools'>)[] | undefined {
  if (options.enabled === false) return
  const [pre, post] = createTracerTransforms(options)
  return [pre, { ...tracerDevTools(options), ...post }]
}

export default VueTracer

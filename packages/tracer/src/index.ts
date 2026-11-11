import type { Plugin } from 'vite'
import { tracerDevTools } from './devtools'
import { tracerTransform } from './transform'

export { tracerDevTools, tracerTransform }

export function VueTracer(): Plugin[] {
  return [tracerTransform(), tracerDevTools()]
}

export default VueTracer

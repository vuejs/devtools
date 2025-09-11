import type { ModuleInfo, ViteRPCFunctions } from '@vue/devtools-core'
import { getViteRpcServer } from '@vue/devtools-kit'
import { debounce } from 'perfect-debounce'
import { RpcFunctionCtx } from './types'

export function getGraphFunctions(ctx: RpcFunctionCtx) {
  const { rpc, server } = ctx
  const debouncedModuleUpdated = debounce(() => {
    getViteRpcServer<ViteRPCFunctions>?.()?.broadcast?.emit('graphModuleUpdated')
  }, 100)

  server.middlewares.use((_, __, next) => {
    debouncedModuleUpdated()
    next()
  })
  return {
    async getGraphModules(): Promise<ModuleInfo[]> {
      const meta = await rpc.getMetadata()
      const modules = (
        meta
          ? await rpc.getModulesList({
              vite: meta?.instances[0].vite,
              env: meta?.instances[0].environments[0],
            })
          : null
      ) || []
      const filteredModules = modules.filter((m) => {
        return m.id.match(/\.(vue|js|ts|jsx|tsx|html|json)($|\?v=)/)
      })
      const graph = filteredModules.map((i) => {
        function searchForVueDeps(id: string, seen = new Set<string>()): string[] {
          if (seen.has(id))
            return []
          seen.add(id)
          const module = modules.find(m => m.id === id)
          if (!module)
            return []
          return module.deps.flatMap((i) => {
            if (filteredModules.find(m => m.id === i))
              return [i]
            return searchForVueDeps(i, seen)
          })
        }

        return {
          id: i.id,
          deps: searchForVueDeps(i.id),
        }
      })
      return graph
    },
  }
}

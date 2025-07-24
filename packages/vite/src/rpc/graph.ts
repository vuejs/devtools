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
      return modules
    },
  }
}

import { ResolvedConfig, ViteDevServer } from 'vite'
import { ViteInspectAPI } from 'vite-plugin-inspect'

export interface RpcFunctionCtx {
  rpc: ViteInspectAPI['rpc']
  server: ViteDevServer
  config: ResolvedConfig
}

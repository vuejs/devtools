import type { RpcFunctionsHost } from '@vitejs/devtools-kit'
import { ResolvedConfig, ViteDevServer } from 'vite'

export interface RpcFunctionCtx {
  getRpc: () => RpcFunctionsHost | undefined
  server: ViteDevServer
  config: ResolvedConfig
}

import type { AssetImporter, AssetInfo, ImageMeta, ModuleInfo } from './types'
import { createRpcClient, createRpcServer, getViteRpcClient } from '@vue/devtools-kit'
import { createHooks } from 'hookable'

const hooks = createHooks()

export const viteRpcFunctions = {
  on: (event: string, handler: Function) => {
    hooks.hook(event, handler)
  },
  off: (event: string, handler: Function) => {
    hooks.removeHook(event, handler)
  },
  once: (event: string, handler: Function) => {
    hooks.hookOnce(event, handler)
  },
  emit: (event: string, ...args: any[]) => {
    hooks.callHook(event, ...args)
  },
  heartbeat: () => { return true },
}

export type ViteRPCFunctions = typeof viteRpcFunctions & {
  // assets
  getStaticAssets: () => Promise<AssetInfo[]>
  getAssetImporters: (url: string) => Promise<AssetImporter[]>
  getImageMeta: (filepath: string) => Promise<ImageMeta>
  getTextAssetContent: (filepath: string, limit?: number) => Promise<string>
  // config
  getRoot: () => Promise<string>
  // graph
  getGraphModules: () => Promise<ModuleInfo[]>
}

export const viteRpc = new Proxy<{
  value: ReturnType<typeof getViteRpcClient<ViteRPCFunctions>>
  functions: ReturnType<typeof getViteRpcClient<ViteRPCFunctions>>
}>({
  value: {} as ReturnType<typeof getViteRpcClient<ViteRPCFunctions>>,
  functions: {} as ReturnType<typeof getViteRpcClient<ViteRPCFunctions>>,
}, {
  get(target, property) {
    const _rpc = getViteRpcClient<ViteRPCFunctions>()
    if (property === 'value') {
      return _rpc
    }
    else if (property === 'functions') {
      return _rpc?.$functions
    }
  },
})

export function onViteRpcConnected(callback: () => void) {
  let timer: number = null!

  function heartbeat() {
    viteRpc.value?.heartbeat?.().then(() => {
      clearTimeout(timer)
      callback()
    }).catch(() => ({}))
    timer = setTimeout(() => {
      heartbeat()
    }, 80) as unknown as number
  }

  heartbeat()
}

export function createViteClientRpc() {
  createRpcClient(viteRpcFunctions, {
    preset: 'vite',
  })
}

export function createViteServerRpc(functions: Record<string, any>) {
  createRpcServer(functions, {
    preset: 'vite',
  })
}

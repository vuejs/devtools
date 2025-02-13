import type { BirpcGroup, BirpcOptions, ChannelOptions } from 'birpc'
import { target } from '@vue/devtools-shared'
import { BirpcReturn, createBirpc, createBirpcGroup } from 'birpc'
import {
  createBroadcastChannel,
  createElectronClientChannel,
  createElectronProxyChannel,
  createElectronServerChannel,
  createExtensionClientChannel,
  createExtensionProxyChannel,
  createExtensionServerChannel,
  createIframeClientChannel,
  createIframeServerChannel,
  createViteClientChannel,
  createViteServerChannel,
} from './presets'
import { MergeableChannelOptions } from './types'

export type Presets = 'iframe' | 'electron' | 'vite' | 'broadcast' | 'extension'
export {
  getExtensionClientContext,
  setElectronClientContext,
  setElectronProxyContext,
  setElectronServerContext,
  setExtensionClientContext,
  setIframeServerContext,
  setViteClientContext,
  setViteServerContext,
} from './presets'
export interface CreateRpcClientOptions<RemoteFunctions> {
  options?: BirpcOptions<RemoteFunctions>
  preset?: Presets
  channel?: ChannelOptions
}

export interface CreateRpcServerOptions<RemoteFunctions> {
  options?: BirpcOptions<RemoteFunctions>
  preset?: Presets
  channel?: ChannelOptions
}

target.__VUE_DEVTOOLS_KIT_MESSAGE_CHANNELS__ ??= []
target.__VUE_DEVTOOLS_KIT_RPC_CLIENT__ ??= null!
target.__VUE_DEVTOOLS_KIT_RPC_SERVER__ ??= null!
target.__VUE_DEVTOOLS_KIT_VITE_RPC_CLIENT__ ??= null!
target.__VUE_DEVTOOLS_KIT_VITE_RPC_SERVER__ ??= null!
target.__VUE_DEVTOOLS_KIT_BROADCAST_RPC_SERVER__ ??= null!

function setRpcClientToGlobal<R, L>(rpc: BirpcReturn<R, L>) {
  target.__VUE_DEVTOOLS_KIT_RPC_CLIENT__ = rpc
}

export function setRpcServerToGlobal<R, L>(rpc: BirpcGroup<R, L>) {
  target.__VUE_DEVTOOLS_KIT_RPC_SERVER__ = rpc
}

export function getRpcClient<R, L extends object = Record<string, never>>(): BirpcReturn<R, L> {
  return target.__VUE_DEVTOOLS_KIT_RPC_CLIENT__!
}

export function getRpcServer<R, L extends object = Record<string, never>>(): BirpcGroup<R, L> {
  return target.__VUE_DEVTOOLS_KIT_RPC_SERVER__!
}

export function setViteRpcClientToGlobal<R, L>(rpc: BirpcReturn<R, L>) {
  target.__VUE_DEVTOOLS_KIT_VITE_RPC_CLIENT__ = rpc
}

export function setViteRpcServerToGlobal<R, L>(rpc: BirpcGroup<R, L>) {
  target.__VUE_DEVTOOLS_KIT_VITE_RPC_SERVER__ = rpc
}

export function getViteRpcClient<R, L extends object = Record<string, never>>(): BirpcReturn<R, L> {
  return target.__VUE_DEVTOOLS_KIT_VITE_RPC_CLIENT__!
}

export function getViteRpcServer<R, L extends object = Record<string, never>>(): BirpcGroup<R, L> {
  return target.__VUE_DEVTOOLS_KIT_VITE_RPC_SERVER__!
}

function getChannel(preset: Presets, host: 'client' | 'proxy' | 'server' = 'client'): MergeableChannelOptions {
  const channel = {
    iframe: {
      client: createIframeClientChannel,
      server: createIframeServerChannel,
    }[host],
    electron: {
      client: createElectronClientChannel,
      proxy: createElectronProxyChannel,
      server: createElectronServerChannel,
    }[host],
    vite: {
      client: createViteClientChannel,
      server: createViteServerChannel,
    }[host],
    broadcast: {
      client: createBroadcastChannel,
      server: createBroadcastChannel,
    }[host],
    extension: {
      client: createExtensionClientChannel,
      proxy: createExtensionProxyChannel,
      server: createExtensionServerChannel,
    }[host],
  }[preset]
  return channel()
}

export function createRpcClient<RemoteFunctions = Record<string, never>, LocalFunctions extends object = Record<string, never>>(functions: LocalFunctions, options: CreateRpcClientOptions<RemoteFunctions> = {}) {
  const { channel: _channel, options: _options, preset } = options

  const channel = preset ? getChannel(preset)! : _channel!
  const rpc = createBirpc<RemoteFunctions, LocalFunctions>(functions, {
    ..._options,
    ...channel,
    timeout: -1,
  })

  // special case for vite
  if (preset === 'vite') {
    setViteRpcClientToGlobal<RemoteFunctions, LocalFunctions>(rpc)
    return
  }

  setRpcClientToGlobal<RemoteFunctions, LocalFunctions>(rpc)
  return rpc
}

export function createRpcServer<RemoteFunctions = Record<string, never>, LocalFunctions extends object = Record<string, never>>(functions: LocalFunctions, options: CreateRpcServerOptions<RemoteFunctions> = {}) {
  const { channel: _channel, options: _options, preset } = options
  const channel = preset ? getChannel(preset, 'server')! : _channel!

  const rpcServer = getRpcServer<RemoteFunctions, LocalFunctions>()
  if (!rpcServer) {
    const group = createBirpcGroup<RemoteFunctions, LocalFunctions>(functions, [channel], {
      ..._options,
      timeout: -1,
    })

    // special case for vite
    if (preset === 'vite') {
      setViteRpcServerToGlobal(group)
      return
    }

    setRpcServerToGlobal(group)
  }
  else {
    rpcServer.updateChannels((channels) => {
      channels.push(channel)
    })
  }
}

export function createRpcProxy<RemoteFunctions = Record<string, never>, LocalFunctions extends object = Record<string, never>>(options: CreateRpcClientOptions<RemoteFunctions> = {}) {
  const { channel: _channel, options: _options, preset } = options
  const channel = preset ? getChannel(preset, 'proxy')! : _channel!
  return createBirpc<RemoteFunctions, LocalFunctions>({} as LocalFunctions, {
    ..._options,
    ...channel,
    timeout: -1,
  })
}

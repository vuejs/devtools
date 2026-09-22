import type { DevtoolsRpcClient } from '../client'
import type { DevtoolsClientHost } from '../connect'
import type { DevtoolsRpcServer } from '../server'
import { DEFAULT_DEVTOOLS_RPC_CHANNEL_ID } from '../constants'
import { connectPanelChannel } from 'devframe/in-page-channel'
import type { DevtoolsInPageProtocol } from '../types'
import type { RuntimeQuery } from '../../runtime'
import { DEVTOOLS_RPC_QUERY, DEVTOOLS_RPC_COMMAND, DEVTOOLS_RPC_EVENT } from '../constants'

export interface StartIframeDevtoolsRpcHostOptions {
  window?: Window
  channelId?: string
  allowedOrigins?: string[]
}

export interface ConnectDevtoolsIframeClientOptions {
  window?: Window
  targetWindow?: Window
  targetOrigin?: string
  channelId?: string
}

export function startIframeDevtoolsRpcHost(
  server: DevtoolsRpcServer,
  options: StartIframeDevtoolsRpcHostOptions = {},
): () => void {
  const host = server.attachInPage({
    name: options.channelId ?? DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
    window: options.window ?? getWindow() ?? false,
    allowedOrigins: options.allowedOrigins,
  })
  return () => host.dispose()
}

export function connectDevtoolsIframeClient(
  options: ConnectDevtoolsIframeClientOptions = {},
): DevtoolsRpcClient {
  const clientWindow = options.window ?? getWindow()
  if (!clientWindow) throw new Error('Devtools iframe RPC requires a browser window')
  const channel = connectPanelChannel<DevtoolsInPageProtocol>({
    name: options.channelId ?? DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
    window: clientWindow,
    targets: options.targetWindow ? [options.targetWindow] : undefined,
    allowedOrigins: options.targetOrigin ? [options.targetOrigin] : undefined,
    functions: {},
  })
  const query = <T>(request: RuntimeQuery): Promise<T> =>
    channel.call(DEVTOOLS_RPC_QUERY, request) as Promise<T>
  return {
    query: query as DevtoolsRpcClient['query'],
    queryCustom: query,
    command: (request) => channel.call(DEVTOOLS_RPC_COMMAND, request),
    commandCustom: (request) => channel.call(DEVTOOLS_RPC_COMMAND, request),
    onEvent: (handler) => channel.on(DEVTOOLS_RPC_EVENT, handler),
    onConnectionChanged: (handler) => channel.events.on('status:updated', handler),
    dispose: () => channel.close(),
  }
}

export function createIframeDevtoolsClientHost(
  options: ConnectDevtoolsIframeClientOptions = {},
): DevtoolsClientHost {
  return {
    kind: 'iframe',
    available() {
      return isIframeDevtoolsClientHostAvailable(options)
    },
    connect() {
      return connectDevtoolsIframeClient(options)
    },
  }
}

export function isIframeDevtoolsClientHostAvailable(
  options: Pick<ConnectDevtoolsIframeClientOptions, 'window' | 'targetWindow'> = {},
): boolean {
  const clientWindow = options.window ?? getWindow()
  if (!clientWindow) return false

  const targetWindow = options.targetWindow ?? clientWindow.parent
  return !!targetWindow && targetWindow !== clientWindow
}

function getWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

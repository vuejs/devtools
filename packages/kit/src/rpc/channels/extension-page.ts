import type { DevtoolsRpcServer } from '../server'
import {
  DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
  DEVTOOLS_IFRAME_RPC_CONNECT,
  DEVTOOLS_IFRAME_RPC_SOURCE,
} from '../constants'
import { createMessagePortDevtoolsRpcChannel } from '../channel'

export interface StartExtensionPageRpcHostOptions {
  window?: Window
  channelId?: string
  allowedOrigins?: string[] | ((origin: string, event: MessageEvent) => boolean)
}

function getWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

interface IframeRpcConnectMessage {
  source: typeof DEVTOOLS_IFRAME_RPC_SOURCE
  type: typeof DEVTOOLS_IFRAME_RPC_CONNECT
  channelId: string
}

export function startExtensionPageRpcHost(
  server: DevtoolsRpcServer,
  options: StartExtensionPageRpcHostOptions = {},
): () => void {
  const hostWindow = options.window ?? getWindow()
  if (!hostWindow) return () => {}

  const channelId = options.channelId ?? DEFAULT_DEVTOOLS_RPC_CHANNEL_ID
  const disposers = new Set<() => void>()
  const listener = (event: MessageEvent) => {
    if (event.source !== hostWindow) return
    if (!isConnectMessage(event.data, channelId)) return
    if (!isOriginAllowed(event.origin, event, options.allowedOrigins)) return

    const port = event.ports[0]
    if (!port) return

    const handle = server.attach(createMessagePortDevtoolsRpcChannel(port))
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      port.removeEventListener('close', dispose)
      handle.dispose()
      port.close()
      disposers.delete(dispose)
    }
    port.addEventListener('close', dispose, { once: true })
    disposers.add(dispose)
  }

  hostWindow.addEventListener('message', listener)

  return () => {
    hostWindow.removeEventListener('message', listener)
    disposers.forEach((dispose) => dispose())
    disposers.clear()
  }
}

function isConnectMessage(value: unknown, channelId: string): value is IframeRpcConnectMessage {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as IframeRpcConnectMessage).source === DEVTOOLS_IFRAME_RPC_SOURCE &&
    (value as IframeRpcConnectMessage).type === DEVTOOLS_IFRAME_RPC_CONNECT &&
    (value as IframeRpcConnectMessage).channelId === channelId
  )
}

function isOriginAllowed(
  origin: string,
  event: MessageEvent,
  allowedOrigins: StartExtensionPageRpcHostOptions['allowedOrigins'],
): boolean {
  if (!allowedOrigins) return true
  if (typeof allowedOrigins === 'function') return allowedOrigins(origin, event)
  return allowedOrigins.includes(origin)
}

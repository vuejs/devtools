import type { DevtoolsRpcChannel } from '../channel'
import type { DevtoolsRpcClient } from '../client'
import type { DevtoolsClientHost } from '../connect'
import { createDevtoolsRpcClient } from '../client'

export const DEVTOOLS_EXTENSION_PORT_SOURCE = 'vue-devtools'
export const DEVTOOLS_EXTENSION_PORT_VERSION = 1

export type DevtoolsExtensionPortRole = 'page' | 'panel'

export interface DevtoolsExtensionPortDescriptor {
  source: typeof DEVTOOLS_EXTENSION_PORT_SOURCE
  version: typeof DEVTOOLS_EXTENSION_PORT_VERSION
  role: DevtoolsExtensionPortRole
  tabId?: number
}

export interface ConnectDevtoolsExtensionClientOptions {
  chrome?: ChromeExtensionApi
  tabId?: number
  name?: string
}

export interface ChromeExtensionEvent<TListener> {
  addListener(listener: TListener): void
  removeListener(listener: TListener): void
}

export interface ChromeRuntimePort {
  name: string
  sender?: {
    tab?: {
      id?: number
    }
    frameId?: number
    documentId?: string
    url?: string
  }
  onDisconnect: ChromeExtensionEvent<(port: ChromeRuntimePort) => void>
  onMessage: ChromeExtensionEvent<(message: unknown, port: ChromeRuntimePort) => void>
  disconnect(): void
  postMessage(message: unknown): void
}

export interface ChromeExtensionApi {
  devtools?: {
    inspectedWindow?: {
      tabId?: number
    }
  }
  runtime?: {
    connect(connectInfo?: { name?: string }): ChromeRuntimePort
    lastError?: {
      message?: string
    }
  }
}

export function createDevtoolsExtensionPortName(
  role: DevtoolsExtensionPortRole,
  tabId?: number,
): string {
  const portDescriptor: DevtoolsExtensionPortDescriptor = {
    source: DEVTOOLS_EXTENSION_PORT_SOURCE,
    version: DEVTOOLS_EXTENSION_PORT_VERSION,
    role,
  }

  if (typeof tabId === 'number') portDescriptor.tabId = tabId
  return JSON.stringify(portDescriptor)
}

export function parseDevtoolsExtensionPortName(
  name: string,
): DevtoolsExtensionPortDescriptor | undefined {
  try {
    const value = JSON.parse(name) as Partial<DevtoolsExtensionPortDescriptor>
    if (
      value.source !== DEVTOOLS_EXTENSION_PORT_SOURCE ||
      value.version !== DEVTOOLS_EXTENSION_PORT_VERSION ||
      (value.role !== 'page' && value.role !== 'panel')
    ) {
      return
    }

    if (value.tabId != null && !Number.isInteger(value.tabId)) return

    return value as DevtoolsExtensionPortDescriptor
  } catch {
    return
  }
}

export const DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE = 'vue-devtools:frame-control'

export interface DevtoolsExtensionFrameDescriptor {
  frameId: number
  documentId?: string
  url?: string
  main: boolean
}

export type DevtoolsExtensionFrameActivationReason = 'initial' | 'select' | 'navigation'

export interface DevtoolsExtensionFramesChangedMessage {
  source: typeof DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE
  type: 'frames:changed'
  frames: DevtoolsExtensionFrameDescriptor[]
  activeFrameId?: number
}

export interface DevtoolsExtensionFrameActivatedMessage {
  source: typeof DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE
  type: 'frames:activated'
  frame: DevtoolsExtensionFrameDescriptor
  reason: DevtoolsExtensionFrameActivationReason
}

export interface DevtoolsExtensionFrameSelectMessage {
  source: typeof DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE
  type: 'frames:select'
  frameId: number
}

export type DevtoolsExtensionFrameControlMessage =
  | DevtoolsExtensionFramesChangedMessage
  | DevtoolsExtensionFrameActivatedMessage
  | DevtoolsExtensionFrameSelectMessage

export function isDevtoolsExtensionFrameControlMessage(
  value: unknown,
): value is DevtoolsExtensionFrameControlMessage {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as { source?: unknown }).source === DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

export interface DevtoolsExtensionFrameController {
  getFrames(): DevtoolsExtensionFrameDescriptor[]
  getActiveFrameId(): number | undefined
  selectFrame(frameId: number): void
  onFramesChanged(
    handler: (frames: DevtoolsExtensionFrameDescriptor[], activeFrameId?: number) => void,
  ): () => void
  onFrameActivated(
    handler: (
      frame: DevtoolsExtensionFrameDescriptor,
      reason: DevtoolsExtensionFrameActivationReason,
    ) => void,
  ): () => void
}

export interface DevtoolsExtensionRpcClient extends DevtoolsRpcClient {
  frames: DevtoolsExtensionFrameController
}

export function createChromeRuntimePortDevtoolsRpcChannel(
  port: ChromeRuntimePort,
): DevtoolsRpcChannel {
  const handlers = new WeakMap<
    (data: unknown, ...extras: unknown[]) => void,
    (message: unknown) => void
  >()

  return {
    post(data) {
      port.postMessage(data)
    },
    on(handler) {
      // Frame control messages are transport-level coordination between the
      // panel and the extension background; they must not reach the RPC layer.
      const listener = (message: unknown) => {
        if (isDevtoolsExtensionFrameControlMessage(message)) return
        handler(message)
      }
      handlers.set(handler, listener)
      port.onMessage.addListener(listener)
    },
    off(handler) {
      const listener = handlers.get(handler)
      if (!listener) return
      port.onMessage.removeListener(listener)
      handlers.delete(handler)
    },
  }
}

export function connectDevtoolsExtensionClient(
  options: ConnectDevtoolsExtensionClientOptions = {},
): DevtoolsExtensionRpcClient {
  const chromeApi = options.chrome ?? getChrome()
  const runtime = chromeApi?.runtime
  if (!runtime) throw new Error('Vue Devtools extension RPC requires chrome.runtime')

  const tabId = options.tabId ?? chromeApi?.devtools?.inspectedWindow?.tabId
  if (!Number.isInteger(tabId)) {
    throw new Error('Vue Devtools extension RPC requires chrome.devtools.inspectedWindow.tabId')
  }

  const port = runtime.connect({
    name: options.name ?? createDevtoolsExtensionPortName('panel', tabId),
  })
  const frameController = attachDevtoolsExtensionFrameController(port)
  let disposed = false
  let client: DevtoolsExtensionRpcClient

  const disposePort = () => {
    if (disposed) return
    disposed = true
    frameController.dispose()
    port.disconnect()
  }

  client = Object.assign(
    createDevtoolsRpcClient({
      channel: createChromeRuntimePortDevtoolsRpcChannel(port),
      disposeChannel: disposePort,
    }),
    { frames: frameController.controller },
  )

  port.onDisconnect.addListener(() => {
    if (disposed) return
    disposed = true
    frameController.dispose()
    client.dispose()
  })

  return client
}

function attachDevtoolsExtensionFrameController(port: ChromeRuntimePort): {
  controller: DevtoolsExtensionFrameController
  dispose(): void
} {
  let frames: DevtoolsExtensionFrameDescriptor[] = []
  let activeFrameId: number | undefined
  const framesChangedHandlers = new Set<
    (frames: DevtoolsExtensionFrameDescriptor[], activeFrameId?: number) => void
  >()
  const frameActivatedHandlers = new Set<
    (
      frame: DevtoolsExtensionFrameDescriptor,
      reason: DevtoolsExtensionFrameActivationReason,
    ) => void
  >()

  const listener = (message: unknown) => {
    if (!isDevtoolsExtensionFrameControlMessage(message)) return

    if (message.type === 'frames:changed') {
      frames = message.frames
      activeFrameId = message.activeFrameId
      framesChangedHandlers.forEach((handler) => handler(frames, activeFrameId))
      return
    }

    if (message.type === 'frames:activated') {
      activeFrameId = message.frame.frameId
      frameActivatedHandlers.forEach((handler) => handler(message.frame, message.reason))
    }
  }

  port.onMessage.addListener(listener)

  return {
    controller: {
      getFrames() {
        return frames
      },
      getActiveFrameId() {
        return activeFrameId
      },
      selectFrame(frameId) {
        const message: DevtoolsExtensionFrameSelectMessage = {
          source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
          type: 'frames:select',
          frameId,
        }
        try {
          port.postMessage(message)
        } catch {}
      },
      onFramesChanged(handler) {
        framesChangedHandlers.add(handler)
        return () => {
          framesChangedHandlers.delete(handler)
        }
      },
      onFrameActivated(handler) {
        frameActivatedHandlers.add(handler)
        return () => {
          frameActivatedHandlers.delete(handler)
        }
      },
    },
    dispose() {
      port.onMessage.removeListener(listener)
      framesChangedHandlers.clear()
      frameActivatedHandlers.clear()
    },
  }
}

export function createExtensionDevtoolsClientHost(
  options: ConnectDevtoolsExtensionClientOptions = {},
): DevtoolsClientHost {
  return {
    kind: 'extension',
    available() {
      return isExtensionDevtoolsClientHostAvailable(options)
    },
    connect() {
      return connectDevtoolsExtensionClient(options)
    },
  }
}

export function isExtensionDevtoolsClientHostAvailable(
  options: Pick<ConnectDevtoolsExtensionClientOptions, 'chrome' | 'tabId'> = {},
): boolean {
  const chromeApi = options.chrome ?? getChrome()
  const tabId = options.tabId ?? chromeApi?.devtools?.inspectedWindow?.tabId
  return !!chromeApi?.runtime?.connect && Number.isInteger(tabId)
}

function getChrome(): ChromeExtensionApi | undefined {
  return (globalThis as { chrome?: ChromeExtensionApi }).chrome
}

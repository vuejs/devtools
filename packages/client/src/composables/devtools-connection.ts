import type { DevToolsRpcClient } from '@vitejs/devtools-kit/client'
import { getDevToolsRpcClient } from '@vitejs/devtools-kit/client'
import type {
  DevtoolsExtensionFrameController,
  DevtoolsExtensionFrameDescriptor,
  DevtoolsExtensionRpcClient,
  DevtoolsRpcClient,
  DevtoolsRpcEventHandler,
} from '@vue/devtools-kit/client'
import { connectDevtoolsClient } from '@vue/devtools-kit/client'
import { ref, shallowRef } from 'vue'

const CONNECTION_HEALTH_INTERVAL = 5_000
const CONNECTION_RETRY_INTERVAL = 1_000
interface DevtoolsConnectionOptions {
  refresh(): Promise<void>
  onRuntimeChanged(): void
  onDisconnect(): void
}

export function createDevtoolsConnection(options: DevtoolsConnectionOptions) {
  let connectionDisposer: (() => void) | undefined
  let eventDisposer: (() => void) | undefined
  let frameController: DevtoolsExtensionFrameController | undefined
  let frameDisposers: Array<() => void> = []
  let connectionRetryTimer: ReturnType<typeof setTimeout> | undefined
  let connectionHealthTimer: ReturnType<typeof setTimeout> | undefined
  let rpcClient: DevtoolsRpcClient | undefined
  let viteRpcClientPromise: Promise<DevToolsRpcClient> | undefined
  let started = false
  let connectionVersion = 0
  const connected = ref(false)
  const error = ref<string>()
  const frames = shallowRef<DevtoolsExtensionFrameDescriptor[]>([])
  const activeFrameId = ref<number>()

  function getRpcClient(): DevtoolsRpcClient | undefined {
    if (rpcClient) return rpcClient

    try {
      rpcClient = connectDevtoolsClient()
      attachFrameController(rpcClient)
      if (rpcClient.onConnectionChanged) {
        let hasEverConnected = false
        connectionDisposer = rpcClient.onConnectionChanged((status) => {
          if (status === 'connected') {
            if (hasEverConnected) {
              options.onRuntimeChanged()
              void options.refresh()
            }
            hasEverConnected = true
          } else if (hasEverConnected) {
            connected.value = false
            options.onDisconnect()
          }
        })
      }
      return rpcClient
    } catch {
      return undefined
    }
  }

  function attachFrameController(client: DevtoolsRpcClient) {
    const controller = (client as Partial<DevtoolsExtensionRpcClient>).frames
    if (!controller) return

    frameController = controller
    frames.value = controller.getFrames()
    activeFrameId.value = controller.getActiveFrameId()
    frameDisposers.push(
      controller.onFramesChanged((frameList, activeId) => {
        frames.value = frameList
        activeFrameId.value = activeId
      }),
      controller.onFrameActivated((frame, reason) => {
        activeFrameId.value = frame.frameId
        if (reason === 'initial') return

        // The panel now talks to a different frame runtime: every id, handle and
        // event stream from the previous frame is invalid.
        connectionVersion++
        options.onRuntimeChanged()
        void options.refresh()
      }),
    )
  }

  function detachFrameController() {
    frameDisposers.forEach((dispose) => dispose())
    frameDisposers = []
    frameController = undefined
    frames.value = []
    activeFrameId.value = undefined
  }

  function selectFrame(frameId: number) {
    if (frameId === activeFrameId.value) return
    frameController?.selectFrame(frameId)
  }

  function getViteRpcClient(): Promise<DevToolsRpcClient> {
    viteRpcClientPromise ??= getDevToolsRpcClient().catch((err) => {
      viteRpcClientPromise = undefined
      throw err
    })
    return viteRpcClientPromise
  }

  function scheduleConnectionRetry() {
    if (!started || connectionRetryTimer) return
    connectionRetryTimer = setTimeout(() => {
      connectionRetryTimer = undefined
      void options.refresh()
    }, CONNECTION_RETRY_INTERVAL)
  }

  function scheduleConnectionHealthCheck() {
    if (!started || connectionHealthTimer || rpcClient?.onConnectionChanged) return
    connectionHealthTimer = setTimeout(() => {
      connectionHealthTimer = undefined
      void checkConnectionHealth()
    }, CONNECTION_HEALTH_INTERVAL)
  }

  async function checkConnectionHealth() {
    const version = connectionVersion
    const client = getRpcClient()
    if (!client) {
      scheduleConnectionRetry()
      return
    }

    try {
      const health = await client.query({ type: 'runtime:health' })
      if (!started || version !== connectionVersion) return
      connected.value = health.status === 'ready'
      error.value = undefined
      scheduleConnectionHealthCheck()
    } catch (err) {
      if (!started || version !== connectionVersion) return
      connected.value = false
      error.value = err instanceof Error ? err.message : String(err)
      disconnectRpcClient()
      scheduleConnectionRetry()
    }
  }

  function disconnectRpcClient() {
    connectionVersion++
    connected.value = false
    options.onDisconnect()
    eventDisposer?.()
    eventDisposer = undefined
    detachFrameController()
    connectionDisposer?.()
    connectionDisposer = undefined
    rpcClient?.dispose()
    rpcClient = undefined
    clearConnectionHealthTimer()
  }

  function clearConnectionRetryTimer() {
    if (!connectionRetryTimer) return
    clearTimeout(connectionRetryTimer)
    connectionRetryTimer = undefined
  }

  function clearConnectionHealthTimer() {
    if (!connectionHealthTimer) return
    clearTimeout(connectionHealthTimer)
    connectionHealthTimer = undefined
  }

  function clearConnectionTimers() {
    clearConnectionRetryTimer()
    clearConnectionHealthTimer()
  }

  function listenRuntimeEvents(client: DevtoolsRpcClient, handler: DevtoolsRpcEventHandler) {
    eventDisposer ??= client.onEvent(handler)
  }

  function start() {
    if (started) return
    started = true
    void options.refresh()
  }

  function stop() {
    started = false
    disconnectRpcClient()
    viteRpcClientPromise = undefined
    clearConnectionTimers()
  }

  return {
    connected,
    error,
    frames,
    activeFrameId,
    getRpcClient,
    getViteRpcClient,
    selectFrame,
    scheduleConnectionRetry,
    scheduleConnectionHealthCheck,
    disconnectRpcClient,
    clearConnectionRetryTimer,
    listenRuntimeEvents,
    start,
    stop,
  }
}

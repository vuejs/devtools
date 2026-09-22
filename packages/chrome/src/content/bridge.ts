import {
  createDevtoolsExtensionPortName,
  DEVTOOLS_IFRAME_RPC_CONNECT,
  DEVTOOLS_IFRAME_RPC_SOURCE,
} from '@vue/devtools-kit/client'
import { CHROME_DEVTOOLS_RPC_CHANNEL_ID } from '../shared/rpc'

interface PageRuntimeConnection {
  dispose(): void
}

interface IsolatedWorldDevtoolsState {
  __VUE_DEVTOOLS_CHROME_PAGE_RUNTIME_CONNECTION__?: PageRuntimeConnection
}

const isolatedWorldDevtoolsState = globalThis as typeof globalThis & IsolatedWorldDevtoolsState

isolatedWorldDevtoolsState.__VUE_DEVTOOLS_CHROME_PAGE_RUNTIME_CONNECTION__?.dispose()
isolatedWorldDevtoolsState.__VUE_DEVTOOLS_CHROME_PAGE_RUNTIME_CONNECTION__ =
  connectPageRuntimeToBackground()

function connectPageRuntimeToBackground(): PageRuntimeConnection {
  const pageRuntimeChannel = new MessageChannel()
  const backgroundPort = chrome.runtime.connect({
    name: createDevtoolsExtensionPortName('page'),
  })
  let disposed = false

  const forwardPageRuntimeMessageToBackground = (event: MessageEvent) => {
    if (disposed) return
    backgroundPort.postMessage(event.data)
  }
  const forwardBackgroundMessageToPageRuntime = (message: unknown) => {
    if (disposed) return
    pageRuntimeChannel.port1.postMessage(message)
  }
  const onPageHide = () => {
    dispose()
  }
  const dispose = (disconnectRuntime = true) => {
    if (disposed) return
    disposed = true
    pageRuntimeChannel.port1.removeEventListener('message', forwardPageRuntimeMessageToBackground)
    backgroundPort.onMessage.removeListener(forwardBackgroundMessageToPageRuntime)
    backgroundPort.onDisconnect.removeListener(onBackgroundPortDisconnect)
    window.removeEventListener('pagehide', onPageHide)
    pageRuntimeChannel.port1.close()
    if (disconnectRuntime) backgroundPort.disconnect()

    if (
      isolatedWorldDevtoolsState.__VUE_DEVTOOLS_CHROME_PAGE_RUNTIME_CONNECTION__?.dispose ===
      dispose
    ) {
      delete isolatedWorldDevtoolsState.__VUE_DEVTOOLS_CHROME_PAGE_RUNTIME_CONNECTION__
    }
  }
  const onBackgroundPortDisconnect = () => {
    dispose(false)
  }

  pageRuntimeChannel.port1.start()
  pageRuntimeChannel.port1.addEventListener('message', forwardPageRuntimeMessageToBackground)
  backgroundPort.onMessage.addListener(forwardBackgroundMessageToPageRuntime)
  backgroundPort.onDisconnect.addListener(onBackgroundPortDisconnect)
  window.addEventListener('pagehide', onPageHide)

  window.postMessage(
    {
      channelId: CHROME_DEVTOOLS_RPC_CHANNEL_ID,
      source: DEVTOOLS_IFRAME_RPC_SOURCE,
      type: DEVTOOLS_IFRAME_RPC_CONNECT,
    },
    '*',
    [pageRuntimeChannel.port2],
  )

  return { dispose }
}

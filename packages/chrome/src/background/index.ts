import type { PageRuntimeBridgeTarget } from './port-router'
import { createTabPortRouter } from './port-router'
import {
  isVueDevtoolsDetectionMessage,
  isVueDevtoolsDetectionQueryMessage,
} from '../shared/detection'
import {
  clearTabDetectionState,
  getMergedTabDetectionState,
  resetTabDetectionState,
  updateTabDetectionState,
} from './tab-state'

function injectPageRuntimeBridge({ tabId, frameId }: PageRuntimeBridgeTarget): void {
  chrome.scripting.executeScript(
    {
      files: ['dist/content-bridge.js'],
      target: frameId == null ? { allFrames: true, tabId } : { frameIds: [frameId], tabId },
    },
    () => {
      void chrome.runtime.lastError
    },
  )
}

const tabPorts = createTabPortRouter({ injectPageRuntimeBridge })

chrome.runtime.onConnect.addListener((port) => {
  tabPorts.connect(port)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The devtools page asks for the tab-wide aggregate to decide whether the
  // panel should exist, since Vue may only live in a subframe.
  if (isVueDevtoolsDetectionQueryMessage(message)) {
    sendResponse(getMergedTabDetectionState(message.tabId))
    return
  }

  const tabId = sender.tab?.id
  if (typeof tabId !== 'number' || !isVueDevtoolsDetectionMessage(message)) return

  const frameId = sender.frameId ?? 0
  updateTabDetectionState(tabId, frameId, message.payload)

  // A detection message from a frame without a live page port means the frame's
  // document was (re)created — reconnect it while the panel is open.
  if (tabPorts.hasPanel(tabId) && !tabPorts.hasPageFrame(tabId, frameId))
    injectPageRuntimeBridge({ tabId, frameId })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') resetTabDetectionState(tabId)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  tabPorts.disconnectTab(tabId)
  clearTabDetectionState(tabId)
})

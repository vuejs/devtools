import type {
  ChromeRuntimePort,
  DevtoolsExtensionFrameActivationReason,
  DevtoolsExtensionFrameDescriptor,
  DevtoolsExtensionFramesChangedMessage,
  DevtoolsExtensionFrameActivatedMessage,
} from '@vue/devtools-kit/client'
import {
  DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
  isDevtoolsExtensionFrameControlMessage,
  parseDevtoolsExtensionPortName,
} from '@vue/devtools-kit/client'

export interface TabPortRouter {
  connect(port: ChromeRuntimePort): void
  disconnectTab(tabId: number): void
  hasPanel(tabId: number): boolean
  hasPageFrame(tabId: number, frameId: number): boolean
}

export interface PageRuntimeBridgeTarget {
  tabId: number
  frameId?: number
}

export interface CreateTabPortRouterOptions {
  injectPageRuntimeBridge(target: PageRuntimeBridgeTarget): void
}

export const MAIN_FRAME_ID = 0

interface PageFramePort {
  port: ChromeRuntimePort
  frame: DevtoolsExtensionFrameDescriptor
}

interface TabDevtoolsPorts {
  panel?: ChromeRuntimePort
  pages: Map<number, PageFramePort>
  /** The frame the panel explicitly asked for; sticky across navigations. */
  requestedFrameId?: number
  activeFrameId?: number
  stopForwarding?: () => void
  stopPanelControl?: () => void
}

export function createTabPortRouter(options: CreateTabPortRouterOptions): TabPortRouter {
  const tabPorts = new Map<number, TabDevtoolsPorts>()

  function getTabPorts(tabId: number): TabDevtoolsPorts {
    const existing = tabPorts.get(tabId)
    if (existing) return existing

    const created: TabDevtoolsPorts = { pages: new Map() }
    tabPorts.set(tabId, created)
    return created
  }

  function cleanupTabIfEmpty(tabId: number): void {
    const ports = tabPorts.get(tabId)
    if (ports && !ports.panel && ports.pages.size === 0) tabPorts.delete(tabId)
  }

  function connect(port: ChromeRuntimePort): void {
    const descriptor = parseDevtoolsExtensionPortName(port.name)
    if (!descriptor) return

    if (descriptor.role === 'panel') connectPanelPort(port, descriptor.tabId)
    else connectPagePort(port)
  }

  function connectPagePort(port: ChromeRuntimePort): void {
    const tabId = port.sender?.tab?.id
    if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
      port.disconnect()
      return
    }

    const frameId = port.sender?.frameId ?? MAIN_FRAME_ID
    const ports = getTabPorts(tabId)
    const frame: DevtoolsExtensionFrameDescriptor = {
      frameId,
      documentId: port.sender?.documentId,
      url: port.sender?.url,
      main: frameId === MAIN_FRAME_ID,
    }

    const existing = ports.pages.get(frameId)
    if (existing?.port === port) return
    if (existing && ports.activeFrameId === frameId) deactivateFrame(ports)

    // Replace the entry before disconnecting the stale port so its disconnect
    // listener sees it no longer owns the frame and leaves the new entry alone.
    ports.pages.set(frameId, { port, frame })
    existing?.port.disconnect()

    port.onDisconnect.addListener(() => {
      const current = ports.pages.get(frameId)
      if (current?.port !== port) return

      ports.pages.delete(frameId)
      if (ports.activeFrameId === frameId) deactivateFrame(ports)
      notifyFramesChanged(ports)
      cleanupTabIfEmpty(tabId)
    })

    if (ports.panel && pickFrameToActivate(ports) === frameId) {
      // Take over from a fallback binding only for the frame the panel asked
      // for, or for the main frame arriving after an early subframe.
      const shouldSwitch =
        ports.activeFrameId == null || frameId === ports.requestedFrameId || frame.main
      if (shouldSwitch && ports.activeFrameId !== frameId)
        activateFrame(ports, frameId, 'navigation')
    }
    notifyFramesChanged(ports)
  }

  function connectPanelPort(port: ChromeRuntimePort, tabId: number | undefined): void {
    if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
      port.disconnect()
      return
    }

    const ports = getTabPorts(tabId)
    if (ports.panel === port) return

    const previousPanel = ports.panel
    if (previousPanel) {
      deactivateFrame(ports)
      ports.stopPanelControl?.()
    }

    ports.panel = port
    ports.requestedFrameId = undefined
    previousPanel?.disconnect()

    const controlListener = (message: unknown) => {
      if (!isDevtoolsExtensionFrameControlMessage(message)) return
      if (message.type !== 'frames:select') return

      ports.requestedFrameId = message.frameId
      if (ports.pages.has(message.frameId)) {
        if (ports.activeFrameId !== message.frameId) activateFrame(ports, message.frameId, 'select')
      } else {
        notifyFramesChanged(ports)
      }
    }
    port.onMessage.addListener(controlListener)
    ports.stopPanelControl = () => {
      port.onMessage.removeListener(controlListener)
      ports.stopPanelControl = undefined
    }

    port.onDisconnect.addListener(() => {
      if (ports.panel !== port) return

      deactivateFrame(ports)
      ports.stopPanelControl?.()
      ports.panel = undefined
      ports.requestedFrameId = undefined
      cleanupTabIfEmpty(tabId)
    })

    options.injectPageRuntimeBridge({ tabId })

    const candidate = pickFrameToActivate(ports)
    if (candidate != null) activateFrame(ports, candidate, 'initial')
    notifyFramesChanged(ports)
  }

  function pickFrameToActivate(ports: TabDevtoolsPorts): number | undefined {
    // A frame the panel explicitly selected stays sticky: wait for it to come
    // back after a navigation instead of silently falling back to another one.
    if (ports.requestedFrameId != null)
      return ports.pages.has(ports.requestedFrameId) ? ports.requestedFrameId : undefined
    if (ports.pages.has(MAIN_FRAME_ID)) return MAIN_FRAME_ID
    return [...ports.pages.keys()].sort((a, b) => a - b)[0]
  }

  function activateFrame(
    ports: TabDevtoolsPorts,
    frameId: number,
    reason: DevtoolsExtensionFrameActivationReason,
  ): void {
    const page = ports.pages.get(frameId)
    const panel = ports.panel
    if (!page || !panel) return

    deactivateFrame(ports)
    ports.activeFrameId = frameId

    const forwardToPage = (message: unknown) => {
      if (isDevtoolsExtensionFrameControlMessage(message)) return
      safePostMessage(page.port, message)
    }
    const forwardToPanel = (message: unknown) => {
      safePostMessage(panel, message)
    }

    panel.onMessage.addListener(forwardToPage)
    page.port.onMessage.addListener(forwardToPanel)
    ports.stopForwarding = () => {
      panel.onMessage.removeListener(forwardToPage)
      page.port.onMessage.removeListener(forwardToPanel)
      ports.stopForwarding = undefined
    }

    const activated: DevtoolsExtensionFrameActivatedMessage = {
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:activated',
      frame: page.frame,
      reason,
    }
    safePostMessage(panel, activated)
  }

  function deactivateFrame(ports: TabDevtoolsPorts): void {
    ports.stopForwarding?.()
    ports.activeFrameId = undefined
  }

  function notifyFramesChanged(ports: TabDevtoolsPorts): void {
    if (!ports.panel) return

    const message: DevtoolsExtensionFramesChangedMessage = {
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:changed',
      frames: [...ports.pages.values()]
        .map((page) => page.frame)
        .sort((a, b) => a.frameId - b.frameId),
      activeFrameId: ports.activeFrameId,
    }
    safePostMessage(ports.panel, message)
  }

  return {
    connect,
    disconnectTab(tabId) {
      const ports = tabPorts.get(tabId)
      if (!ports) return

      deactivateFrame(ports)
      ports.stopPanelControl?.()
      ports.panel?.disconnect()
      for (const page of ports.pages.values()) page.port.disconnect()
      tabPorts.delete(tabId)
    },
    hasPanel(tabId) {
      return !!tabPorts.get(tabId)?.panel
    },
    hasPageFrame(tabId, frameId) {
      return !!tabPorts.get(tabId)?.pages.has(frameId)
    },
  }
}

function safePostMessage(port: ChromeRuntimePort | undefined, message: unknown): void {
  try {
    port?.postMessage(message)
  } catch {
    port?.disconnect()
  }
}

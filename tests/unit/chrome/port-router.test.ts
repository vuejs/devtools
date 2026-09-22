import { describe, expect, it, vi } from 'vitest'
import type {
  DevtoolsExtensionFrameActivatedMessage,
  DevtoolsExtensionFrameControlMessage,
  DevtoolsExtensionFramesChangedMessage,
} from '../../../packages/kit/src/rpc/channels/extension'
import {
  createDevtoolsExtensionPortName,
  DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
  isDevtoolsExtensionFrameControlMessage,
} from '../../../packages/kit/src/rpc/channels/extension'
import { createTabPortRouter } from '../../../packages/chrome/src/background/port-router'
import { MockChromeRuntimePort } from '../../helpers/chrome-port'

function panelPort(tabId: number): MockChromeRuntimePort {
  return new MockChromeRuntimePort(createDevtoolsExtensionPortName('panel', tabId))
}

function pagePort(
  tabId: number,
  frameId = 0,
  documentId = `doc-${frameId}`,
  url = frameId === 0 ? 'https://app.example/' : `https://frame-${frameId}.example/child`,
): MockChromeRuntimePort {
  return new MockChromeRuntimePort(createDevtoolsExtensionPortName('page'), {
    tabId,
    frameId,
    documentId,
    url,
  })
}

function controlMessages(port: MockChromeRuntimePort): DevtoolsExtensionFrameControlMessage[] {
  return port.messages.filter(isDevtoolsExtensionFrameControlMessage)
}

function dataMessages(port: MockChromeRuntimePort): unknown[] {
  return port.messages.filter((message) => !isDevtoolsExtensionFrameControlMessage(message))
}

function lastFramesChanged(
  port: MockChromeRuntimePort,
): DevtoolsExtensionFramesChangedMessage | undefined {
  return controlMessages(port)
    .filter(
      (message): message is DevtoolsExtensionFramesChangedMessage =>
        message.type === 'frames:changed',
    )
    .at(-1)
}

function activations(port: MockChromeRuntimePort): DevtoolsExtensionFrameActivatedMessage[] {
  return controlMessages(port).filter(
    (message): message is DevtoolsExtensionFrameActivatedMessage =>
      message.type === 'frames:activated',
  )
}

function selectFrame(panel: MockChromeRuntimePort, frameId: number): void {
  panel.receive({
    source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
    type: 'frames:select',
    frameId,
  })
}

describe('Chrome tab port router', () => {
  it('connects panel and main-frame page ports in both directions', () => {
    const injectPageRuntimeBridge = vi.fn()
    const router = createTabPortRouter({ injectPageRuntimeBridge })
    const panel = panelPort(7)
    const page = pagePort(7)

    router.connect(panel)
    router.connect(page)
    panel.receive({ id: 'from-panel' })
    page.receive({ id: 'from-page' })

    expect(injectPageRuntimeBridge).toHaveBeenCalledWith({ tabId: 7 })
    expect(dataMessages(page)).toEqual([{ id: 'from-panel' }])
    expect(dataMessages(panel)).toEqual([{ id: 'from-page' }])
  })

  it('removes forwarding when a page port disconnects', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(9)
    const page = pagePort(9)

    router.connect(panel)
    router.connect(page)
    page.disconnect()
    panel.receive({ ignored: true })

    expect(dataMessages(page)).toEqual([])
  })

  it('disconnects every port and removes forwarding when a tab closes', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(10)
    const page = pagePort(10)
    const iframePage = pagePort(10, 4)

    router.connect(panel)
    router.connect(page)
    router.connect(iframePage)
    router.disconnectTab(10)
    panel.receive({ ignored: true })

    expect(panel.disconnected).toBe(true)
    expect(page.disconnected).toBe(true)
    expect(iframePage.disconnected).toBe(true)
    expect(dataMessages(page)).toEqual([])
    expect(router.hasPanel(10)).toBe(false)
    expect(router.hasPageFrame(10, 0)).toBe(false)
  })

  it('rejects page ports without a valid sender tab', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const page = new MockChromeRuntimePort(createDevtoolsExtensionPortName('page'))

    router.connect(page)

    expect(page.disconnected).toBe(true)
  })

  // https://github.com/vuejs/devtools/issues/984
  // https://github.com/vuejs/devtools/issues/687
  // https://github.com/vuejs/devtools/issues/745
  it('lists every connected frame and binds the panel to the main frame by default', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(1)
    const iframePage = pagePort(1, 5)
    const mainPage = pagePort(1, 0)

    router.connect(panel)
    router.connect(iframePage)
    router.connect(mainPage)
    panel.receive({ id: 'to-active' })
    iframePage.receive({ id: 'from-inactive-iframe' })

    const framesChanged = lastFramesChanged(panel)
    expect(framesChanged?.frames).toEqual([
      { frameId: 0, documentId: 'doc-0', url: 'https://app.example/', main: true },
      { frameId: 5, documentId: 'doc-5', url: 'https://frame-5.example/child', main: false },
    ])
    expect(framesChanged?.activeFrameId).toBe(0)
    expect(dataMessages(mainPage)).toEqual([{ id: 'to-active' }])
    expect(dataMessages(iframePage)).toEqual([])
    // Events from an inactive frame must never reach the panel (no cross-frame
    // handle or event bleed).
    expect(dataMessages(panel)).toEqual([])
  })

  it('activates the first connected frame when there is no main frame yet', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(2)
    const iframePage = pagePort(2, 3)

    router.connect(panel)
    router.connect(iframePage)
    panel.receive({ id: 'ping' })

    expect(activations(panel).at(-1)?.frame.frameId).toBe(3)
    expect(dataMessages(iframePage)).toEqual([{ id: 'ping' }])
  })

  it('switches forwarding to the selected frame without leaking control messages', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(3)
    const mainPage = pagePort(3, 0)
    const iframePage = pagePort(3, 8)

    router.connect(panel)
    router.connect(mainPage)
    router.connect(iframePage)
    selectFrame(panel, 8)
    panel.receive({ id: 'after-select' })
    mainPage.receive({ id: 'from-old-frame' })

    const activated = activations(panel).at(-1)
    expect(activated?.frame.frameId).toBe(8)
    expect(activated?.reason).toBe('select')
    expect(dataMessages(iframePage)).toEqual([{ id: 'after-select' }])
    expect(dataMessages(mainPage)).toEqual([])
    // frames:select is panel-to-background coordination only.
    expect(controlMessages(mainPage)).toEqual([])
    expect(controlMessages(iframePage)).toEqual([])
    expect(dataMessages(panel)).toEqual([])
  })

  // https://github.com/vuejs/devtools/issues/505
  it('rebinds the panel when the active frame navigates to a new document', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(4)
    const firstDocument = pagePort(4, 0, 'doc-a')

    router.connect(panel)
    router.connect(firstDocument)
    firstDocument.disconnect()
    panel.receive({ id: 'while-navigating' })

    const nextDocument = pagePort(4, 0, 'doc-b')
    router.connect(nextDocument)
    panel.receive({ id: 'after-navigation' })

    const activated = activations(panel).at(-1)
    expect(activated?.frame).toMatchObject({ frameId: 0, documentId: 'doc-b' })
    expect(activated?.reason).toBe('navigation')
    expect(dataMessages(nextDocument)).toEqual([{ id: 'after-navigation' }])
    expect(dataMessages(firstDocument)).toEqual([])
  })

  it('keeps an explicit frame selection sticky across that frame navigating', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(5)
    const mainPage = pagePort(5, 0)
    const iframeFirst = pagePort(5, 6, 'doc-first')

    router.connect(panel)
    router.connect(mainPage)
    router.connect(iframeFirst)
    selectFrame(panel, 6)
    iframeFirst.disconnect()
    // While the selected frame is gone the panel must not silently fall back
    // to the main frame.
    panel.receive({ id: 'while-frame-gone' })

    const iframeNext = pagePort(5, 6, 'doc-next')
    router.connect(iframeNext)
    panel.receive({ id: 'after-reconnect' })

    expect(dataMessages(mainPage)).toEqual([])
    expect(activations(panel).at(-1)?.frame).toMatchObject({
      frameId: 6,
      documentId: 'doc-next',
    })
    expect(dataMessages(iframeNext)).toEqual([{ id: 'after-reconnect' }])
  })

  it('replaces a stale page port when the same frame reconnects before disconnect fires', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(6)
    const stale = pagePort(6, 0, 'doc-stale')

    router.connect(panel)
    router.connect(stale)

    const fresh = pagePort(6, 0, 'doc-fresh')
    router.connect(fresh)
    panel.receive({ id: 'ping' })

    expect(stale.disconnected).toBe(true)
    expect(router.hasPageFrame(6, 0)).toBe(true)
    expect(dataMessages(fresh)).toEqual([{ id: 'ping' }])
  })

  it('waits for a not-yet-connected frame after frames:select', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(11)
    const mainPage = pagePort(11, 0)

    router.connect(panel)
    router.connect(mainPage)
    selectFrame(panel, 9)
    panel.receive({ id: 'pending-select' })

    expect(dataMessages(mainPage)).toEqual([{ id: 'pending-select' }])

    const iframePage = pagePort(11, 9)
    router.connect(iframePage)
    panel.receive({ id: 'after-connect' })

    expect(activations(panel).at(-1)?.frame.frameId).toBe(9)
    expect(dataMessages(iframePage)).toEqual([{ id: 'after-connect' }])
  })

  it('cleans up frame state when the panel closes and reports port presence', () => {
    const router = createTabPortRouter({ injectPageRuntimeBridge: vi.fn() })
    const panel = panelPort(12)
    const mainPage = pagePort(12, 0)

    router.connect(panel)
    router.connect(mainPage)

    expect(router.hasPanel(12)).toBe(true)
    expect(router.hasPageFrame(12, 0)).toBe(true)
    expect(router.hasPageFrame(12, 1)).toBe(false)

    panel.disconnect()
    mainPage.receive({ id: 'orphan' })

    expect(router.hasPanel(12)).toBe(false)
    expect(router.hasPageFrame(12, 0)).toBe(true)
    expect(dataMessages(panel)).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueDevtoolsDetectionPayload } from '../../../packages/chrome/src/shared/detection'

class MockChromeEvent<TArgs extends unknown[]> {
  private listeners = new Set<(...args: TArgs) => void>()

  addListener(listener: (...args: TArgs) => void): void {
    this.listeners.add(listener)
  }

  emit(...args: TArgs): void {
    for (const listener of this.listeners) listener(...args)
  }
}

interface StubDevtoolsChromeOptions {
  evalResult?: () => boolean
  aggregatePayload?: () => VueDevtoolsDetectionPayload | undefined
}

function stubDevtoolsChrome(options: StubDevtoolsChromeOptions = {}) {
  const onNavigated = new MockChromeEvent<[]>()
  const createPanel = vi.fn((_title, _icon, _page, callback: () => void) => callback())
  const sendMessage = vi.fn(
    (_message, callback: (payload?: VueDevtoolsDetectionPayload) => void) => {
      callback(options.aggregatePayload?.())
    },
  )

  vi.stubGlobal('chrome', {
    devtools: {
      inspectedWindow: {
        eval: vi.fn((_expression, callback: (result: boolean) => void) =>
          callback(options.evalResult?.() ?? false),
        ),
        tabId: 42,
      },
      network: { onNavigated },
      panels: { create: createPanel },
    },
    runtime: { sendMessage },
  })

  return { createPanel, onNavigated, sendMessage }
}

describe('Chrome DevTools background page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates the Vue panel once when the inspected page has Vue', async () => {
    const { createPanel, onNavigated } = stubDevtoolsChrome({ evalResult: () => true })

    await import('../../../packages/chrome/src/devtools/background')
    await vi.advanceTimersByTimeAsync(0)
    onNavigated.emit()
    await vi.advanceTimersByTimeAsync(0)

    expect(createPanel).toHaveBeenCalledTimes(1)
    expect(createPanel).toHaveBeenCalledWith(
      'Vue',
      'icons/128.png',
      'dist/app/panel/devtools-panel.html',
      expect.any(Function),
    )
  })

  it('rechecks detection after inspected-page navigation', async () => {
    let detected = false
    const { createPanel, onNavigated } = stubDevtoolsChrome({ evalResult: () => detected })

    await import('../../../packages/chrome/src/devtools/background')
    await vi.advanceTimersByTimeAsync(0)

    detected = true
    onNavigated.emit()
    await vi.advanceTimersByTimeAsync(0)

    expect(createPanel).toHaveBeenCalledTimes(1)
  })

  // Vue may only live inside an iframe; the top-frame eval cannot see it, but
  // the background aggregate can. https://github.com/vuejs/devtools/issues/687
  it('creates the panel when Vue is only detected in a subframe', async () => {
    const { createPanel, sendMessage } = stubDevtoolsChrome({
      evalResult: () => false,
      aggregatePayload: () => ({
        appCount: 1,
        devtoolsEnabled: true,
        installed: true,
        nuxtDetected: false,
        vitePluginDetected: false,
        vitePressDetected: false,
        vueDetected: true,
      }),
    })

    await import('../../../packages/chrome/src/devtools/background')
    await vi.advanceTimersByTimeAsync(0)

    expect(sendMessage).toHaveBeenCalled()
    expect(createPanel).toHaveBeenCalledTimes(1)
  })

  it('does not create the panel when no frame detects Vue', async () => {
    const { createPanel } = stubDevtoolsChrome({
      evalResult: () => false,
      aggregatePayload: () => undefined,
    })

    await import('../../../packages/chrome/src/devtools/background')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(createPanel).not.toHaveBeenCalled()
  })
})

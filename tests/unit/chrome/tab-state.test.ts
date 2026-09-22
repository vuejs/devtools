import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VueDevtoolsDetectionPayload } from '../../../packages/chrome/src/shared/detection'
import {
  mergeDetectionPayloads,
  resetTabDetectionState,
  updateTabDetectionState,
} from '../../../packages/chrome/src/background/tab-state'

function payload(
  overrides: Partial<VueDevtoolsDetectionPayload> = {},
): VueDevtoolsDetectionPayload {
  return {
    appCount: 0,
    devtoolsEnabled: false,
    installed: true,
    nuxtDetected: false,
    vitePluginDetected: false,
    vitePressDetected: false,
    vueDetected: false,
    ...overrides,
  }
}

describe('Chrome tab detection aggregation', () => {
  it('reports Vue when only a subframe contains an app', () => {
    const merged = mergeDetectionPayloads([
      payload(),
      payload({ appCount: 1, devtoolsEnabled: true, vueDetected: true }),
    ])

    expect(merged.vueDetected).toBe(true)
    expect(merged.devtoolsEnabled).toBe(true)
    expect(merged.appCount).toBe(1)
  })

  it('sums app counts across frames', () => {
    const merged = mergeDetectionPayloads([
      payload({ appCount: 2, devtoolsEnabled: true, vueDetected: true }),
      payload({ appCount: 3, devtoolsEnabled: true, vueDetected: true }),
    ])

    expect(merged.appCount).toBe(5)
  })

  it('keeps framework flags and the vite client URL from any frame', () => {
    const merged = mergeDetectionPayloads([
      payload({ nuxtDetected: true, vueDetected: true }),
      payload({
        vitePluginDetected: true,
        vitePluginClientUrl: 'http://localhost:5173/__devtools',
      }),
    ])

    expect(merged.nuxtDetected).toBe(true)
    expect(merged.vitePluginDetected).toBe(true)
    expect(merged.vitePluginClientUrl).toBe('http://localhost:5173/__devtools')
  })

  it('stays not-found when no frame detects Vue', () => {
    const merged = mergeDetectionPayloads([payload(), payload()])

    expect(merged.vueDetected).toBe(false)
    expect(merged.devtoolsEnabled).toBe(false)
  })
})

describe('Chrome tab action reset', () => {
  const setIcon = vi.fn()
  const setPopup = vi.fn()

  afterEach(() => {
    setIcon.mockClear()
    setPopup.mockClear()
    vi.unstubAllGlobals()
  })

  it('clears the toolbar icon when detection state is reset', () => {
    vi.stubGlobal('chrome', {
      action: { setIcon, setPopup },
      runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    })

    updateTabDetectionState(7, 0, payload({ devtoolsEnabled: true, vueDetected: true }))
    setIcon.mockClear()
    setPopup.mockClear()

    resetTabDetectionState(7)

    expect(setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        path: expect.objectContaining({ 16: expect.stringContaining('16-gray.png') }),
      }),
    )
    expect(setPopup).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        popup: expect.stringContaining('not-found.html'),
      }),
    )
  })
})

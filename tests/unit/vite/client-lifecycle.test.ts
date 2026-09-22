// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    options: undefined as
      | {
          componentInspectorDockController: {
            closeForComponentInspection(): Promise<(() => Promise<void>) | undefined>
          }
        }
      | undefined,
  }
  const command = vi.fn(async () => ({ status: 1 as const }))
  const disposeIframeHost = vi.fn()
  const disposeKit = vi.fn()

  return {
    startIframeDevtoolsRpcHost: vi.fn(() => disposeIframeHost),
    command,
    disposeIframeHost,
    disposeKit,
    createDevtoolsKit: vi.fn((options) => {
      state.options = options
      return {
        dispose: disposeKit,
        install: vi.fn(),
        rpc: {},
        runtime: { command },
      }
    }),
    state,
  }
})

vi.mock('@vue/devtools-kit', async (importOriginal) => ({
  ...(await importOriginal()),
  startIframeDevtoolsRpcHost: mocks.startIframeDevtoolsRpcHost,
  createDevtoolsKit: mocks.createDevtoolsKit,
}))

vi.mock('@vitejs/devtools-kit/client', () => ({
  getDevToolsClientContext: () => undefined,
}))

import {
  disposeVueDevTools,
  installVueDevTools,
  setupVueDevToolsDockController,
} from '../../../packages/vite/src/client'
import { CLIENT_RUNTIME_KEY } from '../../../packages/vite/src/constants'

describe('Vite client inspector lifecycle', () => {
  afterEach(() => {
    disposeVueDevTools()
    delete (window as unknown as Record<string, unknown>)[CLIENT_RUNTIME_KEY]
    mocks.command.mockClear()
  })

  it.each(['runtime-first', 'dock-first'])(
    'binds the published context with %s loading',
    (order) => {
      const dock = createDockContext()
      if (order === 'runtime-first') installVueDevTools({ enabled: true })
      const state = ((
        window as unknown as Record<
          string,
          { context?: unknown; bindDock?: (context: unknown) => void }
        >
      )[CLIENT_RUNTIME_KEY] ??= {})
      state.context = dock.context
      state.bindDock?.(dock.context)
      if (order === 'dock-first') installVueDevTools({ enabled: true })
      dock.deactivate()
      expect(mocks.command).toHaveBeenCalledExactlyOnceWith({ type: 'components:cancelInspect' })

      disposeVueDevTools()
      state.bindDock?.(dock.context)
      expect(dock.unsubscribe).toHaveBeenCalledOnce()
    },
  )

  it('shares one runtime across independently loaded client modules', async () => {
    const first = installVueDevTools({ enabled: true })
    vi.resetModules()
    const secondClient = await import('../../../packages/vite/src/client')
    expect(secondClient.installVueDevTools({ enabled: true })).toBe(first)
    expect(mocks.createDevtoolsKit).toHaveBeenCalledOnce()
    const dock = createDockContext()
    secondClient.setupVueDevToolsDockController(dock.context)
    dock.deactivate()
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith({ type: 'components:cancelInspect' })
  })

  it('cancels on external dock deactivation but not while locator hides the dock', async () => {
    installVueDevTools({ enabled: true })
    const first = createDockContext()
    setupVueDevToolsDockController(first.context)

    first.deactivate()
    expect(mocks.command).toHaveBeenCalledWith({ type: 'components:cancelInspect' })
    mocks.command.mockClear()

    const restore =
      await mocks.state.options?.componentInspectorDockController.closeForComponentInspection()
    expect(first.switchEntry).toHaveBeenCalledWith(null)
    expect(mocks.command).not.toHaveBeenCalled()

    await restore?.()
    expect(first.switchEntry).toHaveBeenLastCalledWith('vue-devtools')

    first.deactivate()
    expect(mocks.command).toHaveBeenCalledWith({ type: 'components:cancelInspect' })
  })

  it('replaces and disposes dock deactivation listeners', () => {
    installVueDevTools({ enabled: true })
    const first = createDockContext()
    const second = createDockContext()

    setupVueDevToolsDockController(first.context)
    setupVueDevToolsDockController(second.context)
    expect(first.unsubscribe).toHaveBeenCalledOnce()

    disposeVueDevTools()
    expect(second.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.disposeIframeHost).toHaveBeenCalled()
    expect(mocks.disposeKit).toHaveBeenCalled()
  })
})

function createDockContext() {
  let onDeactivate = () => {}
  const unsubscribe = vi.fn()
  const switchEntry = vi.fn(async (id: string | null) => {
    if (id === null) onDeactivate()
    return true
  })
  const context = {
    current: {
      events: {
        on(event: string, handler: () => void) {
          if (event === 'entry:deactivated') onDeactivate = handler
          return unsubscribe
        },
      },
    },
    docks: {
      selectedId: 'vue-devtools',
      switchEntry,
    },
    panel: {
      session: { open: true },
    },
  } as unknown as Parameters<typeof setupVueDevToolsDockController>[0]

  return {
    context,
    deactivate: () => onDeactivate(),
    switchEntry,
    unsubscribe,
  }
}

// @vitest-environment happy-dom

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

const agent = vi.hoisted(() => {
  const register = vi.fn((_connection: unknown, _page: { url: string; title: string }) => vi.fn())
  const sessionDispose = vi.fn()
  const createSession = vi.fn(() => ({ query: vi.fn(), dispose: sessionDispose }))
  return { register, sessionDispose, createSession }
})

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

vi.mock('@vue/devtools-agentic/devframe', () => ({
  createVueDevtoolsAgentSession: agent.createSession,
  registerVueDevtoolsAgentPage: agent.register,
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
    agent.register.mockReset()
    agent.register.mockImplementation(() => vi.fn())
    agent.sessionDispose.mockClear()
    agent.createSession.mockClear()
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

  it('registers agent tools once while MCP is advertised and follows the document location', async () => {
    const initialUrl = location.href
    const initialTitle = document.title
    onTestFinished(() => {
      history.replaceState({}, '', initialUrl)
      document.title = initialTitle
    })
    installVueDevTools({ enabled: true })
    const dock = createDockContext({ mcp: true })
    setupVueDevToolsDockController(dock.context)
    await vi.waitFor(() => expect(agent.register).toHaveBeenCalledOnce())
    setupVueDevToolsDockController(dock.context)
    expect(agent.createSession).toHaveBeenCalledOnce()
    expect(agent.createSession).toHaveBeenCalledWith(expect.any(Function), { idleTimeoutMs: null })
    expect(Object.hasOwn(history, 'pushState')).toBe(false)
    expect(Object.hasOwn(history, 'replaceState')).toBe(false)
    const page = agent.register.mock.calls[0][1]
    expect(page.url).toBe(location.href)
    history.pushState({}, '', '/settings?tab=1#main')
    expect(page.url).toBe(new URL('/settings?tab=1#main', location.origin).href)
    document.title = 'Next'
    expect(JSON.parse(JSON.stringify(page))).toEqual({
      id: expect.any(String),
      url: new URL('/settings?tab=1#main', location.origin).href,
      title: 'Next',
    })

    const closed = createDockContext()
    setupVueDevToolsDockController(closed.context)
    expect(agent.register.mock.results[0].value).toHaveBeenCalledOnce()
    expect(agent.sessionDispose).toHaveBeenCalledOnce()
  })

  it('drops a failed agent registration and tries again on the next setup', async () => {
    installVueDevTools({ enabled: true })
    agent.register.mockImplementationOnce(() => {
      throw new Error('register failed')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setupVueDevToolsDockController(createDockContext({ mcp: true }).context)
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    expect(agent.sessionDispose).toHaveBeenCalledOnce()
    error.mockRestore()

    setupVueDevToolsDockController(createDockContext({ mcp: true }).context)
    await vi.waitFor(() => expect(agent.register).toHaveBeenCalledTimes(2))
    expect(agent.createSession).toHaveBeenCalledTimes(2)
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

function createDockContext(options?: { mcp?: boolean }) {
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
    ...(options?.mcp ? { rpc: { connectionMeta: { mcp: { path: '__mcp' } } } } : {}),
  } as unknown as Parameters<typeof setupVueDevToolsDockController>[0]

  return {
    context,
    deactivate: () => onDeactivate(),
    switchEntry,
    unsubscribe,
  }
}

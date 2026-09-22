import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import type { DevtoolsRpcServer } from '../../../packages/kit/src/rpc/server'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { CHROME_DEVTOOLS_RPC_CHANNEL_ID } from '../../../packages/chrome/src/shared/rpc'
import { startExtensionPageRpcHost } from '../../../packages/kit/src/rpc/channels/extension-page'
import { createDevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import { createMessagePortDevtoolsRpcChannel } from '../../../packages/kit/src/rpc/channel'
import {
  connectDevtoolsIframeClient,
  isIframeDevtoolsClientHostAvailable,
} from '../../../packages/kit/src/rpc/channels/iframe'
import {
  DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
  DEVTOOLS_IFRAME_RPC_CONNECT,
  DEVTOOLS_IFRAME_RPC_SOURCE,
} from '../../../packages/kit/src/rpc/constants'
import { createDevtoolsRpcServer } from '../../../packages/kit/src/rpc/server'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

describe('iframe RPC channel', () => {
  let client: DevtoolsRpcClient | undefined
  let disposeHost: (() => void) | undefined
  let runtime: DevtoolsRuntime | undefined
  let server: DevtoolsRpcServer | undefined

  afterEach(() => {
    client?.dispose()
    disposeHost?.()
    server?.dispose()
    runtime?.dispose()
  })

  it('connects an iframe client and completes an RPC query', async () => {
    const host = createWindowFixture('https://client.test')
    const frame = createWindowFixture()
    frame.setParent(host.window)

    runtime = createDevtoolsRuntime()
    server = createDevtoolsRpcServer(runtime)
    disposeHost = startExtensionPageRpcHost(server, {
      allowedOrigins: ['https://client.test'],
      window: host.window,
    })
    const ports = new MessageChannel()
    client = createDevtoolsRpcClient({
      channel: createMessagePortDevtoolsRpcChannel(
        ports.port1 as unknown as globalThis.MessagePort,
      ),
      disposeChannel: () => ports.port1.close(),
    })
    host.dispatch({
      data: {
        source: DEVTOOLS_IFRAME_RPC_SOURCE,
        type: DEVTOOLS_IFRAME_RPC_CONNECT,
        channelId: DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
      },
      origin: 'https://client.test',
      ports: [ports.port2],
      source: host.window,
    } as unknown as MessageEvent)

    await expect(client.query({ type: 'runtime:health' })).resolves.toMatchObject({
      status: 'ready',
    })
  })

  it('ignores invalid sources, origins, and channel ids', () => {
    const host = createWindowFixture('https://allowed.test')
    const attach = vi.fn(() => ({ dispose: vi.fn() }))
    const rpcServer = { attach } as unknown as DevtoolsRpcServer
    disposeHost = startExtensionPageRpcHost(rpcServer, {
      allowedOrigins: ['https://allowed.test'],
      channelId: 'expected',
      window: host.window,
    })

    dispatchConnect(host, { source: 'other', channelId: 'expected' })
    dispatchConnect(host, { channelId: 'other' })
    host.origin = 'https://blocked.test'
    dispatchConnect(host, { channelId: 'expected' })
    host.origin = 'https://allowed.test'
    dispatchConnect(host, { channelId: 'expected', sourceWindow: createWindowFixture().window })
    host.origin = 'null'
    dispatchConnect(host, { channelId: 'expected', sourceWindow: createWindowFixture().window })

    expect(attach).not.toHaveBeenCalled()
  })

  // https://github.com/vuejs/devtools/issues/1004
  it('isolates Chrome and Vite inspector transports by channel', () => {
    const host = createWindowFixture('https://client.test')
    const viteAttach = vi.fn(() => ({ dispose: vi.fn() }))
    const chromeAttach = vi.fn(() => ({ dispose: vi.fn() }))
    const disposeViteHost = startExtensionPageRpcHost(
      { attach: viteAttach } as unknown as DevtoolsRpcServer,
      { window: host.window },
    )
    const disposeChromeHost = startExtensionPageRpcHost(
      { attach: chromeAttach } as unknown as DevtoolsRpcServer,
      {
        channelId: CHROME_DEVTOOLS_RPC_CHANNEL_ID,
        window: host.window,
      },
    )

    try {
      dispatchConnect(host, { channelId: CHROME_DEVTOOLS_RPC_CHANNEL_ID })

      expect(chromeAttach).toHaveBeenCalledOnce()
      expect(viteAttach).not.toHaveBeenCalled()

      dispatchConnect(host)

      expect(viteAttach).toHaveBeenCalledOnce()
      expect(chromeAttach).toHaveBeenCalledOnce()
    } finally {
      disposeChromeHost()
      disposeViteHost()
    }
  })

  it('disposes active channels and removes the message listener', () => {
    const host = createWindowFixture('https://client.test')
    const disposeChannel = vi.fn()
    const attach = vi.fn(() => ({ dispose: disposeChannel }))
    const rpcServer = { attach } as unknown as DevtoolsRpcServer
    disposeHost = startExtensionPageRpcHost(rpcServer, { window: host.window })

    dispatchConnect(host)
    expect(attach).toHaveBeenCalledOnce()

    disposeHost()
    dispatchConnect(host)

    expect(disposeChannel).toHaveBeenCalledOnce()
    expect(attach).toHaveBeenCalledOnce()
  })

  it('reports iframe host availability and missing windows', () => {
    const host = createWindowFixture()
    const frame = createWindowFixture()
    frame.setParent(host.window)

    expect(isIframeDevtoolsClientHostAvailable({ window: frame.window })).toBe(true)
    expect(isIframeDevtoolsClientHostAvailable({ window: host.window })).toBe(false)
    expect(isIframeDevtoolsClientHostAvailable({ window: undefined })).toBe(false)
    expect(() => connectDevtoolsIframeClient({ window: undefined })).toThrow(
      'requires a browser window',
    )
  })
})

interface WindowFixture {
  dispatch(event: MessageEvent): void
  origin: string
  setParent(parent: Window | undefined): void
  window: Window & { MessageChannel: typeof globalThis.MessageChannel }
}

function createWindowFixture(origin = 'https://client.test'): WindowFixture {
  const listeners = new Set<(event: MessageEvent) => void>()
  const fixture = {
    origin,
    dispatch(event: MessageEvent) {
      listeners.forEach((listener) => listener(event))
    },
    setParent(parent: Window | undefined) {
      Object.defineProperty(fixture.window, 'parent', {
        configurable: true,
        value: parent,
      })
    },
  } as WindowFixture
  const window = {
    MessageChannel: MessageChannel as unknown as typeof globalThis.MessageChannel,
    addEventListener(type: string, listener: EventListener) {
      if (type === 'message') listeners.add(listener as (event: MessageEvent) => void)
    },
    parent: undefined,
    postMessage(data: unknown, _targetOrigin: string, transfer: Transferable[]) {
      fixture.dispatch({ data, origin: fixture.origin, ports: transfer } as unknown as MessageEvent)
    },
    removeEventListener(type: string, listener: EventListener) {
      if (type === 'message') listeners.delete(listener as (event: MessageEvent) => void)
    },
  } as unknown as WindowFixture['window']
  fixture.window = window
  fixture.setParent(window)
  return fixture
}

function dispatchConnect(
  host: WindowFixture,
  overrides: { channelId?: string; source?: string; sourceWindow?: Window } = {},
): void {
  const channel = new MessageChannel()
  host.dispatch({
    data: {
      channelId: overrides.channelId ?? DEFAULT_DEVTOOLS_RPC_CHANNEL_ID,
      source: overrides.source ?? DEVTOOLS_IFRAME_RPC_SOURCE,
      type: DEVTOOLS_IFRAME_RPC_CONNECT,
    },
    origin: host.origin,
    ports: [channel.port2],
    source: overrides.sourceWindow ?? host.window,
  } as unknown as MessageEvent)
  channel.port1.close()
}

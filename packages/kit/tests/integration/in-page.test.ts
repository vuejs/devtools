import { createRpcChannelPair } from '../../../../tests/helpers/rpc-channel'
import { MessageChannel } from 'node:worker_threads'
import { connectPanelChannel } from 'devframe/in-page-channel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsInPageProtocol } from '../../src/rpc/types'
import { createDevtoolsRuntime } from '../../src/runtime/runtime'
import { createDevtoolsRpcServer } from '../../src/rpc/server'

const disposers: Array<() => void> = []
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose())
})

function connect(budget?: Parameters<typeof createDevtoolsRuntime>[0]) {
  const runtime = createDevtoolsRuntime(budget)
  const server = createDevtoolsRpcServer(runtime)
  const host = server.attachInPage({ name: 'vue-devtools:test', window: false })
  const ports = new MessageChannel()
  host.channel.addPanelPort(ports.port1 as unknown as globalThis.MessagePort)
  const panel = connectPanelChannel<DevtoolsInPageProtocol>({
    name: 'vue-devtools:test',
    window: false,
    heartbeat: false,
    functions: {},
    transport: ports.port2 as unknown as globalThis.MessagePort,
  })
  disposers.push(
    () => runtime.dispose(),
    () => server.dispose(),
    () => panel.close(),
  )
  return { runtime, server, host, panel }
}

describe('devframe in-page runtime transport', () => {
  it('handles queries, commands, events, and collection lifecycle', async () => {
    const { runtime, host, panel } = connect()
    expect(runtime.isCollectionActive()).toBe(true)
    await expect(panel.call('devtools:query', { type: 'runtime:health' })).resolves.toMatchObject({
      status: 'ready',
    })
    const command = vi.fn(() => ({ status: 1 as const }))
    runtime.registerCommand('test:command', command)
    await expect(panel.call('devtools:command', { type: 'test:command' })).resolves.toEqual({
      status: 1,
    })
    expect(command).toHaveBeenCalledOnce()
    const event = vi.fn()
    panel.on('devtools:event', event)
    runtime.events.dispatch({ type: 'apps:changed', time: Date.now() })
    await vi.waitFor(() =>
      expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: 'apps:changed' })),
    )
    panel.close()
    await vi.waitFor(() => expect(runtime.isCollectionActive()).toBe(false))
    expect(host.channel.panels).toHaveLength(0)
  })

  it('keeps collection active until both in-page and extension clients disconnect', async () => {
    const { runtime, server, panel } = connect()
    const [channel] = createRpcChannelPair()
    const extension = server.attach(channel)
    expect(runtime.performance.snapshot().attachedClients).toBe(2)
    panel.close()
    await vi.waitFor(() => expect(runtime.performance.snapshot().attachedClients).toBe(1))
    expect(runtime.isCollectionActive()).toBe(true)
    extension.dispose()
    expect(runtime.isCollectionActive()).toBe(false)
  })

  it('preserves response-size budgets', async () => {
    const { runtime, panel } = connect({ budget: { transport: { maxMessageBytes: 100 } } })
    runtime.registerQuery('test:large', () => 'x'.repeat(2000))
    await expect(panel.call('devtools:query', { type: 'test:large' })).rejects.toThrow(
      'maxMessageBytes',
    )
  })
})

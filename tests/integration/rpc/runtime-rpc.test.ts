// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsRpcEvent } from '../../../packages/kit/src/rpc/types'
import type { DevtoolsRpcChannelHandle } from '../../../packages/kit/src/rpc/channel'
import type { DevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import type { DevtoolsRpcServer } from '../../../packages/kit/src/rpc/server'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createDevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import { createDevtoolsRpcServer } from '../../../packages/kit/src/rpc/server'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createComponentTreeFixture } from '../../fixtures'
import { createRpcChannelPair } from '../../helpers/rpc-channel'
import { createComponentTreeLoader } from '../../../packages/client/src/composables/component-tree-loader'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'
import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'

describe('runtime RPC integration', () => {
  let client: DevtoolsRpcClient | undefined
  let handle: DevtoolsRpcChannelHandle | undefined
  let runtime: DevtoolsRuntime | undefined
  let server: DevtoolsRpcServer | undefined

  it('loads 20k siblings over RPC without dropping them and serves state before expansion finishes', async () => {
    const fixture = createComponentTreeFixture(20_001, { branching: 20_000 })
    runtime = createDevtoolsRuntime({ budget: { components: { maxInitialDepth: 0 } } })
    server = createDevtoolsRpcServer(runtime)
    const [serverChannel, clientChannel] = createRpcChannelPair()
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const initial = await client.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    let nodes: ComponentTreeNodeSnapshot[] = initial.nodes
    const failures: unknown[] = []
    let stateAtNodeCount = 0
    let stateRequest: Promise<void> | undefined
    let heartbeat = false
    const loader = createComponentTreeLoader({
      getClient: () => client,
      getAppId: () => 'app:0',
      onError: (error) => failures.push(error),
      apply(patches) {
        nodes = applyComponentTreePatches(nodes, patches)
        if (!stateRequest) {
          stateRequest = client!
            .query({
              type: 'components:stateSnapshot',
              appId: 'app:0',
              payload: { componentId: nodes[1]!.id },
            })
            .then((state) => {
              expect(state?.componentId).toBe(nodes[1]!.id)
              stateAtNodeCount = nodes.length
            })
          setTimeout(() => {
            heartbeat = true
          }, 0)
        }
      },
    })
    await loader.expand(initial.nodes[0]!.id)
    await stateRequest
    expect(failures).toEqual([])
    expect(nodes).toHaveLength(20_001)
    expect(new Set(nodes.map((node) => node.id)).size).toBe(20_001)
    expect(stateAtNodeCount).toBeGreaterThan(1)
    expect(stateAtNodeCount).toBeLessThan(20_001)
    expect(heartbeat).toBe(true)
    expect(runtime.performance.snapshot().droppedEvents).toBe(0)
  })

  it('sends derived component patches without serializing the cyclic Vue instance', async () => {
    const fixture = createComponentTreeFixture(3)
    const [serverChannel, clientChannel] = createRpcChannelPair()
    runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 0 } } })
    server = createDevtoolsRpcServer(runtime)
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })
    const events: DevtoolsRpcEvent[] = []
    client.onEvent((event) => events.push(event))
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    await client.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    fixture.instances[1]!.type.name = 'UpdatedComponent'
    runtime.dispatch({
      type: 'component:update',
      appId: 'app:0',
      instance: fixture.instances[1]!,
      time: Date.now(),
    })
    await runtime.scheduler.flush()
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'components:treePatched')).toBe(true),
    )
    expect(JSON.stringify(events)).toContain('UpdatedComponent')
    expect(
      events.some((event) => event.type === 'component:update' || event.type === 'app:init'),
    ).toBe(false)
    expect(runtime.performance.snapshot().droppedEvents).toBe(0)
  })

  it('rebuilds the current snapshot after reconnecting without replaying patch history', async () => {
    const fixture = createComponentTreeFixture(3)
    runtime = createDevtoolsRuntime()
    server = createDevtoolsRpcServer(runtime)
    let [serverChannel, clientChannel] = createRpcChannelPair()
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const initial = await client.query({
      type: 'components:treeSnapshot',
      appId: 'app:0',
    })
    expect(initial.nodes).toHaveLength(3)
    client.dispose()
    handle.dispose()
    fixture.instances[1]!.type.name = 'ChangedWhileDisconnected'
    ;[serverChannel, clientChannel] = createRpcChannelPair()
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })
    const current = await client.query({
      type: 'components:treeSnapshot',
      appId: 'app:0',
    })
    expect(current.nodes).toHaveLength(3)
    expect(current.nodes.some((node) => node.name === 'ChangedWhileDisconnected')).toBe(true)
    expect(current.version).toBeGreaterThan(0)
  })

  afterEach(() => {
    client?.dispose()
    handle?.dispose()
    server?.dispose()
    runtime?.dispose()
  })

  it('queries runtime state through an in-memory transport', async () => {
    const [serverChannel, clientChannel] = createRpcChannelPair()
    const fixture = createComponentTreeFixture(3, { appName: 'RPC App' })
    runtime = createDevtoolsRuntime()
    server = createDevtoolsRpcServer(runtime)
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })

    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })

    const apps = await client.query({
      type: 'apps:snapshot',
    })
    const components = await client.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })

    expect(apps.apps.map((app) => app.name)).toEqual(['RPC App'])
    expect(components.nodes.map((node) => node.name)).toEqual([
      'FixtureRoot',
      'FixtureComponent1',
      'FixtureComponent2',
    ])
  })

  it('activates collection only while an RPC client is attached', () => {
    const [serverChannel] = createRpcChannelPair()
    runtime = createDevtoolsRuntime({ collectionInitiallyActive: false })
    server = createDevtoolsRpcServer(runtime)

    expect(runtime.isCollectionActive()).toBe(false)
    handle = server.attach(serverChannel)
    expect(runtime.isCollectionActive()).toBe(true)

    handle.dispose()
    expect(runtime.isCollectionActive()).toBe(false)
  })

  it('keeps explicitly registered custom queries and commands callable over RPC', async () => {
    const [serverChannel, clientChannel] = createRpcChannelPair()
    runtime = createDevtoolsRuntime()
    let count = 0
    runtime.registerQuery('extension:count', () => count)
    runtime.registerCommand('extension:increment', () => {
      count++
    })
    server = createDevtoolsRpcServer(runtime)
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })

    expect(await client.commandCustom({ type: 'extension:increment' })).toEqual({ status: 1 })
    expect(await client.queryCustom<number>({ type: 'extension:count' })).toBe(1)
  })

  it('rejects query responses larger than the transport budget', async () => {
    const [serverChannel, clientChannel] = createRpcChannelPair()
    runtime = createDevtoolsRuntime({ budget: { transport: { maxMessageBytes: 1_024 } } })
    runtime.registerQuery('fixture:oversized', () => ({ value: 'x'.repeat(2_000) }))
    server = createDevtoolsRpcServer(runtime)
    handle = server.attach(serverChannel)
    client = createDevtoolsRpcClient({ channel: clientChannel })

    await expect(client.queryCustom({ type: 'fixture:oversized' })).rejects.toThrow(
      'exceeds maxMessageBytes',
    )
    expect(runtime.performance.snapshot().droppedEvents).toBe(1)
  })
})

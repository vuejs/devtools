import { afterEach, expect, it, vi } from 'vitest'
import { reactive, watch } from 'vue'
import { createDevtoolsKit, type DevtoolsKit } from '../../../packages/kit/src/kit'
import { createDevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import { createRpcChannelPair } from '../../helpers/rpc-channel'
import { createComponentTreeFixture } from '../../fixtures'

const kits: DevtoolsKit[] = []
const cleanup: Array<() => void> = []
afterEach(async () => {
  cleanup.splice(0).forEach((stop) => stop())
  for (const kit of kits.splice(0)) await kit.dispose()
})
function createKit() {
  const kit = createDevtoolsKit({ target: { name: 'lazy-setup' }, hook: { install: false } })
  kits.push(kit)
  return kit
}

it('publishes metadata without installing a synchronous deep store watcher', async () => {
  const kit = createKit()
  const entries = reactive(new Map<number, number>())
  const changed = vi.fn()
  const setup = vi.fn(() => {
    cleanup.push(watch(entries, changed, { deep: true, flush: 'sync' }))
  })
  await kit.plugins.register({ id: 'pinia-like', label: 'Store' }, setup)
  expect(kit.plugins.adapters.get('pinia-like')?.descriptor).toMatchObject({
    id: 'pinia-like',
    label: 'Store',
  })
  for (let i = 0; i < 5000; i++) entries.set(i, i)
  expect(setup).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()

  await kit.runtime.queryCustom({ type: 'inspectors:list' })
  expect(setup).toHaveBeenCalledOnce()
  entries.set(5000, 5000)
  expect(changed).toHaveBeenCalledOnce()
})

it('flushes all same-id app-scoped callbacks in order before serving an agent query', async () => {
  const kit = createKit()
  const appA = {},
    appB = {}
  const order: string[] = []
  const layers: string[] = []
  kit.runtime.subscribe('timeline:layerAdded', (event) => layers.push(event.layerId))
  await kit.plugins.register({ id: 'stores', app: appA }, async (api) => {
    order.push('app-a')
    await Promise.resolve()
    api.addInspector({ id: 'a', label: 'A' })
    api.on.getInspectorTree((payload) => {
      payload.rootNodes.push({ id: 'a' })
    })
  })
  await kit.plugins.register({ id: 'stores', app: appA }, (api) => {
    order.push('store-a')
    api.addTimelineLayer({ id: 'mutations', label: 'Mutations', color: 1 })
  })
  await kit.plugins.register({ id: 'stores', app: appB }, (api) => {
    order.push('app-b')
    api.on.getInspectorTree((payload) => {
      payload.rootNodes.push({ id: 'b' })
    })
  })
  kit.runtime.registerQuery('test:ready', () => ({
    order: [...order],
    inspector: kit.runtime.inspectors.getInfo('a', appA),
  }))
  const first = await kit.runtime.queryCustom<{ order: string[]; inspector: unknown }>({
    type: 'test:ready',
  })
  expect(first.order).toEqual(['app-a', 'store-a', 'app-b'])
  expect(first.inspector).toMatchObject({ label: 'A' })
  const payload = { app: appA, inspectorId: 'a', rootNodes: [] as Array<{ id: string }> }
  await kit.runtime.callPluginHook('getInspectorTree', payload)
  expect(payload.rootNodes).toEqual([{ id: 'a' }])
  expect(layers).toContain('mutations')
})

it('activates on a real RPC connection, flushes asynchronous setup, and never replays on reconnect', async () => {
  const kit = createKit()
  const setup = vi.fn(async (api) => {
    await Promise.resolve()
    api.addInspector({ id: 'late', label: 'Late' })
  })
  await kit.plugins.register({ id: 'late' }, setup)
  const [serverChannel, clientChannel] = createRpcChannelPair()
  const handle = kit.rpc.attach(serverChannel)
  const client = createDevtoolsRpcClient({ channel: clientChannel })
  cleanup.push(
    () => client.dispose(),
    () => handle.dispose(),
  )
  await client.query({ type: 'plugins:snapshot' })
  expect(kit.runtime.inspectors.getInfo('late')).toMatchObject({ label: 'Late' })
  handle.dispose()
  const [another] = createRpcChannelPair()
  const again = kit.rpc.attach(another)
  cleanup.push(() => again.dispose())
  await kit.runtime.queryCustom({ type: 'plugins:snapshot' })
  expect(setup).toHaveBeenCalledOnce()
  const later = vi.fn()
  await kit.plugins.register({ id: 'new-store' }, later)
  expect(later).toHaveBeenCalledOnce()
})

it('drops pending callbacks for an unmounted app and a disposed kit', async () => {
  const kit = createKit()
  const { app } = createComponentTreeFixture(1)
  kit.runtime.dispatch({ type: 'app:init', app, time: 1, version: '3.5.0', vueTypes: {} })
  const setup = vi.fn()
  await kit.plugins.register({ id: 'gone', app }, setup)
  kit.runtime.dispatch({ type: 'app:unmount', app, time: 2 })
  await kit.runtime.queryCustom({ type: 'plugins:snapshot' })
  expect(setup).not.toHaveBeenCalled()
  const other = createKit()
  await other.plugins.register({ id: 'disposed' }, setup)
  await other.dispose()
  await other.plugins.activate()
  expect(setup).not.toHaveBeenCalled()
})

it('allows an active setup to await registering another setup without awaiting itself', async () => {
  const kit = createKit()
  const order: string[] = []
  await kit.plugins.register({ id: 'outer' }, async () => {
    order.push('outer-start')
    await kit.plugins.register({ id: 'inner' }, () => {
      order.push('inner')
    })
    order.push('outer-end')
  })
  kit.runtime.registerQuery('test:order', () => [...order])
  expect(await kit.runtime.queryCustom({ type: 'test:order' })).toEqual([
    'outer-start',
    'inner',
    'outer-end',
  ])
})

it('keeps ordinary active register pending until asynchronous setup completes', async () => {
  const kit = createKit()
  await kit.plugins.activate()
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  let completed = false
  const registration = kit.plugins
    .register({ id: 'async-active' }, async () => {
      await ready
    })
    .then(() => {
      completed = true
    })
  await Promise.resolve()
  expect(completed).toBe(false)
  release()
  await registration
  expect(completed).toBe(true)
})

it('starts all pending setups before a register in the same activation tick', async () => {
  const kit = createKit()
  const order: string[] = []
  await kit.plugins.register({ id: 'first' }, () => {
    order.push('first')
  })
  await kit.plugins.register({ id: 'second' }, () => {
    order.push('second')
  })
  const activation = kit.plugins.activate()
  const registration = kit.plugins.register({ id: 'new' }, () => {
    order.push('new')
  })
  expect(order).toEqual(['first', 'second', 'new'])
  await Promise.all([activation, registration])
})

it('starts all pending setups before registrations during an asynchronous setup', async () => {
  const kit = createKit()
  const order: string[] = []
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  await kit.plugins.register({ id: 'first' }, async () => {
    order.push('first')
    await ready
  })
  await kit.plugins.register({ id: 'second' }, () => {
    order.push('second')
  })
  const activation = kit.plugins.activate()
  await Promise.resolve()
  await kit.plugins.register({ id: 'new' }, () => {
    order.push('new')
  })
  expect(order).toEqual(['first', 'second', 'new'])
  release()
  await activation
})

it('detects visitComponentTree hooks installed by delayed setup before planning a snapshot', async () => {
  const kit = createKit()
  const { app } = createComponentTreeFixture(2)
  kit.runtime.dispatch({ type: 'app:init', app, time: 1, version: '3.5.0', vueTypes: {} })
  const visited = vi.fn()
  await kit.plugins.register({ id: 'late-tree', app }, async (api) => {
    await Promise.resolve()
    api.on.visitComponentTree((payload) => {
      const node = payload.treeNode as { id: string; name: string }
      visited(node.id)
      node.name = 'Decorated'
    })
  })
  expect(kit.runtime.hasPluginHook('visitComponentTree')).toBe(false)
  const snapshot = await kit.runtime.queryCustom<{ nodes: Array<{ name: string }> }>({
    type: 'components:treeSnapshot',
    appId: 'app:0',
  })
  expect(kit.runtime.hasPluginHook('visitComponentTree')).toBe(true)
  expect(visited).toHaveBeenCalledTimes(2)
  expect(snapshot.nodes.map((node) => node.name)).toEqual(['Decorated', 'Decorated'])
})

it('allows setup API requests and public typed/custom reentry across await boundaries', async () => {
  const kit = createKit()
  const { app, instances } = createComponentTreeFixture(1)
  kit.runtime.dispatch({ type: 'app:init', app, time: 1, version: '3.5.0', vueTypes: {} })
  const results: unknown[] = []
  await kit.plugins.register({ id: 'reentrant', app }, async (api) => {
    results.push(await api.getComponentName(instances[0]!))
    results.push(await kit.runtime.query({ type: 'apps:snapshot' }))
    results.push(await kit.runtime.queryCustom({ type: 'plugins:snapshot' }))
    results.push(await kit.runtime.command({ type: 'components:cancelInspect' }))
    results.push(await kit.runtime.commandCustom({ type: 'components:cancelInspect' }))
    api.addInspector({ id: 'reentrant', label: 'Ready' })
  })
  const inspectors = await kit.runtime.query({ type: 'inspectors:list' })
  expect(results).toHaveLength(5)
  expect(results[0]).toBe('FixtureRoot')
  expect(inspectors.inspectors).toContainEqual(expect.objectContaining({ id: 'reentrant' }))
})

it('does not wait for in-flight setup on concurrent requests but waits for the initiating query', async () => {
  const kit = createKit()
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  await kit.plugins.register({ id: 'slow' }, async (api) => {
    await ready
    api.addInspector({ id: 'slow', label: 'Slow' })
  })
  const initial = kit.runtime.query({ type: 'inspectors:list' })
  const during = await kit.runtime.query({ type: 'inspectors:list' })
  expect(during.inspectors).toHaveLength(0)
  release()
  expect((await initial).inspectors).toContainEqual(expect.objectContaining({ id: 'slow' }))
})

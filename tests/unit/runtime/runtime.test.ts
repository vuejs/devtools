import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createComponentTreeFixture, createCustomInspectorFixture } from '../../fixtures'

describe('DevtoolsRuntime', () => {
  let runtime: DevtoolsRuntime | undefined

  afterEach(() => {
    vi.useRealTimers()
    runtime?.dispose()
    runtime = undefined
  })

  it('publishes app and component snapshots from normalized runtime events', async () => {
    const fixture = createComponentTreeFixture(6)
    runtime = createDevtoolsRuntime()

    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })

    const apps = await runtime.query({
      type: 'apps:snapshot',
    })
    const components = await runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })

    expect(apps.apps).toEqual([expect.objectContaining({ componentCount: 1, name: 'Fixture App' })])
    expect(components.nodes).toHaveLength(6)
    expect(components.nodes[0]?.name).toBe('FixtureRoot')
  })

  it('coalesces scheduled work by key before a flush', async () => {
    runtime = createDevtoolsRuntime()
    const calls: string[] = []

    runtime.scheduler.schedule('component:1', () => {
      calls.push('stale')
    })
    runtime.scheduler.schedule('component:1', () => {
      calls.push('latest')
    })
    runtime.scheduler.schedule('component:2', () => {
      calls.push('other')
    })
    await runtime.scheduler.flush()

    expect(calls).toEqual(['latest', 'other'])
  })

  it('keeps child links unique on repeated adds, reparenting and removal', async () => {
    const fixture = createComponentTreeFixture(3)
    runtime = createDevtoolsRuntime()
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      time: 1,
      version: '3.5.0',
      vueTypes: {},
    })
    await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    const patched = vi.fn()
    runtime.subscribe('components:treePatched', patched)
    const child = fixture.instances[1]!
    const parent = fixture.instances[2]!
    const add = () =>
      runtime!.dispatch({
        type: 'component:add',
        appId: 'app:0',
        instance: child,
        parent: child.parent,
        time: 2,
      })
    add()
    add()
    expect(patched.mock.calls.flatMap(([event]) => event.patches)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ op: 'insert' })]),
    )
    patched.mockClear()
    child.parent = parent
    add()
    add()
    const patches = patched.mock.calls.flatMap(([event]) => event.patches)
    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'update', id: 'app:0:root', changes: { childCount: 1 } }),
        expect.objectContaining({ op: 'update', id: 'app:0:2', changes: { childCount: 1 } }),
      ]),
    )
    patched.mockClear()
    runtime.dispatch({ type: 'component:remove', appId: 'app:0', instance: child, time: 3 })
    expect(patched.mock.calls.flatMap(([event]) => event.patches)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'update', id: 'app:0:2', changes: { childCount: 0 } }),
      ]),
    )
    patched.mockClear()
    add()
    add()
    expect(patched.mock.calls.flatMap(([event]) => event.patches)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'update', id: 'app:0:2', changes: { childCount: 1 } }),
      ]),
    )
  })

  it('limits the initial tree depth and expands one subtree on demand', async () => {
    const fixture = createComponentTreeFixture(10_000)
    runtime = createDevtoolsRuntime({
      budget: { components: { maxExpandedDepth: 10, maxInitialDepth: 1 } },
    })
    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })

    const initial = await runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })
    const treePatches: Array<{ patches: unknown[] }> = []
    runtime.subscribe('components:treePatched', (event) => treePatches.push(event))

    await runtime.command({
      appId: 'app:0',
      payload: { componentId: initial.nodes[1]!.id },
      type: 'components:expandTreeNode',
    })

    expect(initial.nodes).toHaveLength(21)
    expect(treePatches.at(-1)?.patches).toHaveLength(20)
  })

  it('debounces component updates by app and component key', async () => {
    vi.useFakeTimers()
    const fixture = createComponentTreeFixture(2)
    runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 50 } } })
    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })
    await runtime.query({ appId: 'app:0', type: 'components:treeSnapshot' })
    const listener = vi.fn()
    runtime.subscribe('components:changed', listener)

    for (let time = 2; time < 12; time += 1) {
      runtime.dispatch({
        appId: 'app:0',
        instance: fixture.instances[1]!,
        parent: fixture.instances[0],
        time,
        type: 'component:update',
      })
    }
    await vi.advanceTimersByTimeAsync(50)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(runtime.performance.snapshot().coalescedEvents).toBe(9)
  })

  it('pauses heavy collection without losing app detection', () => {
    const fixture = createComponentTreeFixture(2)
    runtime = createDevtoolsRuntime({ collectionInitiallyActive: false })

    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })
    runtime.dispatch({
      appId: 'app:0',
      instance: fixture.instances[1]!,
      parent: fixture.instances[0],
      time: 2,
      type: 'component:add',
    })

    expect(runtime.registry.listApps()).toHaveLength(1)
    expect(runtime.registry.getApp('app:0')?.components.size).toBe(1)
    expect(runtime.performance.snapshot().droppedEvents).toBe(1)
  })

  it('reads updated collapsed children on expansion without processing their renders', async () => {
    const fixture = createComponentTreeFixture(7, { branching: 2 })
    runtime = createDevtoolsRuntime({ budget: { components: { maxInitialDepth: 1 } } })
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    const changed = vi.fn()
    runtime.subscribe('components:changed', changed)
    for (const instance of fixture.instances.slice(3)) {
      instance.type.name = `Updated${instance.uid}`
      runtime.dispatch({
        type: 'component:update',
        appId: 'app:0',
        instance,
        parent: instance.parent,
        time: 2,
      })
    }
    await runtime.scheduler.flush()
    expect(changed).not.toHaveBeenCalled()
    expect(runtime.registry.getApp('app:0')?.components.size).toBe(3)

    const patched = vi.fn()
    runtime.subscribe('components:treePatched', patched)
    await runtime.command({
      type: 'components:expandTreeNode',
      appId: 'app:0',
      payload: { componentId: 'app:0:1' },
    })
    expect(patched).toHaveBeenCalledWith(
      expect.objectContaining({
        patches: expect.arrayContaining([
          expect.objectContaining({
            op: 'insert',
            node: expect.objectContaining({ name: 'Updated3' }),
          }),
          expect.objectContaining({
            op: 'insert',
            node: expect.objectContaining({ name: 'Updated4' }),
          }),
        ]),
      }),
    )
  })

  it('keeps inspected state fresh when its component is outside the visible tree', async () => {
    const fixture = createComponentTreeFixture(7, { branching: 2 })
    runtime = createDevtoolsRuntime({ budget: { components: { maxInitialDepth: 1 } } })
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    for (const instance of fixture.instances)
      runtime.dispatch({
        type: 'component:add',
        appId: 'app:0',
        instance,
        parent: instance.parent,
        time: 1,
      })
    await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    await runtime.query({
      type: 'components:stateSnapshot',
      appId: 'app:0',
      payload: { componentId: 'app:0:3' },
    })
    const invalidated = vi.fn()
    runtime.subscribe('components:stateInvalidated', invalidated)
    for (const instance of fixture.instances.slice(3, 5))
      runtime.dispatch({
        type: 'component:update',
        appId: 'app:0',
        instance,
        parent: instance.parent,
        time: 2,
      })
    await runtime.scheduler.flush()
    expect(invalidated).toHaveBeenCalledTimes(1)
    expect(invalidated).toHaveBeenCalledWith(expect.objectContaining({ componentId: 'app:0:3' }))
  })

  it('keeps custom inspectors isolated by plugin and app', () => {
    runtime = createDevtoolsRuntime()
    const firstApp = {}
    const secondApp = {}
    const { options } = createCustomInspectorFixture()

    runtime.inspectors.add(options, 'plugin:first', firstApp)
    runtime.inspectors.add({ ...options, label: 'Second Inspector' }, 'plugin:second', secondApp)

    expect(runtime.inspectors.list(firstApp)).toEqual([
      expect.objectContaining({ label: 'Fixture Inspector', pluginId: 'plugin:first' }),
    ])
    expect(runtime.inspectors.list(secondApp)).toEqual([
      expect.objectContaining({ label: 'Second Inspector', pluginId: 'plugin:second' }),
    ])
  })

  it('isolates subscriber failures from later assertions by allowing disposal', () => {
    runtime = createDevtoolsRuntime()
    const listener = vi.fn()
    const dispose = runtime.subscribe('apps:changed', listener)

    dispose()
    runtime.dispatch({ app: {}, time: 1, type: 'app:unmount' })

    expect(listener).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import type { EncodedValue } from '../../../packages/kit/src/codec'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'
import { createComponentTreeFixture } from '../../fixtures'

interface EncodedCustomValue {
  kind: string
  handle?: string
  display?: string
  actions?: Array<{ icon?: string; tooltip?: string }>
}

describe('v6/v7 plugin payload compatibility', () => {
  let kit: DevtoolsKit | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    await kit?.dispose()
    kit = undefined
  })

  function createKit(): DevtoolsKit {
    const created = createDevtoolsKit({
      target: { name: 'V6 Compat Test' },
      hook: { install: false },
    })
    created.install()
    created.runtime.setCollectionActive(true, 1)
    return created
  }

  function initApp(target: DevtoolsKit) {
    const fixture = createComponentTreeFixture(3)
    target.runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      time: 1,
      version: '3.5.0',
      vueTypes: {},
    })
    return fixture
  }

  // https://github.com/vuejs/devtools/issues/832
  it('issue-832: registers a custom timeline layer and event through the v6 API', async () => {
    kit = createKit()
    const layers: Array<{ layerId: string; label?: string; color?: number }> = []
    const events: Array<{ layerId: string; title: string; data?: EncodedValue }> = []
    kit.runtime.subscribe('timeline:layerAdded', (event) => layers.push(event))
    kit.runtime.subscribe('timeline:eventAdded', (event) => events.push(event))

    await kit.plugins.register({ id: 'plugin:pinia' }, (api) => {
      api.addTimelineLayer({ id: 'pinia-mutations', label: 'Pinia', color: 0xf7d336 })
      api.addTimelineEvent({
        layerId: 'pinia-mutations',
        event: {
          time: Date.now(),
          title: 'mutation',
          subtitle: 'counter.increment',
          data: { type: 'direct', storeId: 'counter' },
          groupId: 1,
          logType: 'default',
        },
      })
    })

    await vi.waitFor(() => {
      expect(layers).toContainEqual(
        expect.objectContaining({ layerId: 'pinia-mutations', label: 'Pinia', color: 0xf7d336 }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({ layerId: 'pinia-mutations', title: 'mutation' }),
      )
    })
    expect(events[0]?.data).toMatchObject({ kind: 'object' })
  })

  // https://github.com/vuejs/devtools/issues/918
  it('issue-918: keeps the inspector icon and action metadata from the v6 options', async () => {
    kit = createKit()

    await kit.plugins.register({ id: 'plugin:store' }, (api) => {
      api.addInspector({
        id: 'store-inspector',
        label: 'Store',
        icon: 'storage',
        treeFilterPlaceholder: 'Search stores...',
        actions: [{ icon: 'refresh', tooltip: 'Refresh', action: () => {} }],
        nodeActions: [{ icon: 'open_in_new', tooltip: 'Open', action: () => {} }],
      })
    })

    await vi.waitFor(() => {
      expect(kit!.runtime.inspectors.getInfo('store-inspector')).toMatchObject({
        icon: 'storage',
        label: 'Store',
        treeFilterPlaceholder: 'Search stores...',
        actions: [{ icon: 'refresh', tooltip: 'Refresh' }],
        nodeActions: [{ icon: 'open_in_new', tooltip: 'Open' }],
      })
    })
  })

  // https://github.com/vuejs/devtools/issues/761
  it('issue-761: exposes _custom.actions from inspectComponent and executes them via handle', async () => {
    kit = createKit()
    initApp(kit)
    const action = vi.fn()

    await kit.plugins.register({ id: 'plugin:router' }, (api) => {
      api.on.inspectComponent((payload) => {
        const instanceData = payload.instanceData as { state: unknown[] }
        instanceData.state.push({
          type: 'routing',
          key: '$route',
          value: {
            _custom: {
              type: 'router',
              display: 'Route',
              value: { path: '/' },
              actions: [{ icon: 'open_in_new', tooltip: 'Open route', action }],
            },
          },
          editable: false,
        })
      })
    })

    const tree = await kit.runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })
    const snapshot = await kit.runtime.query({
      appId: 'app:0',
      type: 'components:stateSnapshot',
      payload: { componentId: tree.nodes[0]!.id },
    })

    const section = snapshot?.sections.find((item) => item.id === 'routing')
    const entry = section?.entries.find((item) => item.key === '$route')
    const value = entry?.value as EncodedCustomValue
    expect(value).toMatchObject({
      kind: 'custom',
      actions: [{ icon: 'open_in_new', tooltip: 'Open route' }],
    })
    expect(value.handle).toBeDefined()

    const result = await kit.runtime.command({
      type: 'values:customAction',
      payload: { handle: value.handle!, actionIndex: 0 },
    })
    expect(result.status).toBe(1)
    expect(action).toHaveBeenCalledTimes(1)
  })

  // https://github.com/vuejs/devtools/issues/728
  it('issue-728: safely encodes timeline event data with hostile getters', async () => {
    kit = createKit()
    const events: Array<{ title: string }> = []
    kit.runtime.subscribe('timeline:eventAdded', (event) => events.push(event))

    const hostileData = {
      safe: 1,
      get boom(): never {
        throw new Error('getter boom')
      },
    }
    const result = await kit.runtime.command({
      type: 'timeline:addEvent',
      payload: {
        pluginId: 'plugin:test',
        options: {
          layerId: 'plugin-test-layer',
          event: { time: Date.now(), title: 'hostile', data: hostileData },
        },
      },
    })

    expect(result.status).toBe(1)
    expect(events).toContainEqual(expect.objectContaining({ title: 'hostile' }))
  })

  // https://github.com/vuejs/devtools/issues/694
  it('issue-694: malformed plugin payloads return diagnosable errors instead of throwing', async () => {
    kit = createKit()

    const missingEvent = await kit.runtime.commandCustom({
      type: 'timeline:addEvent',
      payload: { pluginId: 'plugin:test', options: { layerId: 'x' } },
    })
    const missingTitle = await kit.runtime.commandCustom({
      type: 'timeline:addEvent',
      payload: { pluginId: 'plugin:test', options: { layerId: 'x', event: { time: 1 } } },
    })
    const missingOptions = await kit.runtime.commandCustom({
      type: 'inspectors:add',
      payload: { pluginId: 'plugin:test' },
    })
    const nullPayload = await kit.runtime.commandCustom({
      type: 'timeline:addLayer',
      payload: null,
    })

    for (const result of [missingEvent, missingTitle, missingOptions, nullPayload]) {
      expect(result.status).toBe(0)
      expect(result.error).toBeDefined()
    }
  })

  it('supports the v6 inspector tree/state/edit mutation contract', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    const store: Record<string, unknown> = { count: 1 }

    await kit.plugins.register({ id: 'plugin:store', app: fixture.app }, (api) => {
      api.addInspector({ id: 'v6-store', label: 'V6 Store' })
      api.on.getInspectorTree((payload) => {
        if (payload.inspectorId !== 'v6-store') return
        payload.rootNodes.push({
          id: 'root-store',
          label: 'Root Store',
          tags: [{ label: 'root', textColor: 0xffffff, backgroundColor: 0x42b883 }],
        })
      })
      api.on.getInspectorState((payload) => {
        if (payload.inspectorId !== 'v6-store' || payload.nodeId !== 'root-store') return
        payload.state = {
          state: [{ key: 'count', value: store.count, editable: true }],
        }
      })
      api.on.editInspectorState((payload) => {
        if (payload.inspectorId !== 'v6-store') return
        payload.set?.(store, payload.path, payload.state.value)
      })
    })

    await vi.waitFor(() =>
      expect(kit!.runtime.inspectors.get('v6-store', fixture.app)).toBeDefined(),
    )

    const tree = await kit.runtime.query({
      appId: 'app:0',
      type: 'inspectors:treeSnapshot',
      payload: { inspectorId: 'v6-store' },
    })
    expect(tree.rootNodes).toEqual([
      expect.objectContaining({
        id: 'root-store',
        tags: [expect.objectContaining({ label: 'root' })],
      }),
    ])

    const state = await kit.runtime.query({
      appId: 'app:0',
      type: 'inspectors:stateSnapshot',
      payload: { inspectorId: 'v6-store', nodeId: 'root-store' },
    })
    const entry = state?.sections.find((section) => section.id === 'state')?.entries[0]
    expect(entry).toMatchObject({ key: 'count', value: { kind: 'number', value: 1 } })

    const edited = await kit.runtime.command({
      appId: 'app:0',
      type: 'inspectors:editState',
      payload: {
        inspectorId: 'v6-store',
        nodeId: 'root-store',
        sectionId: 'state',
        path: ['count'],
        value: 5,
      },
    })
    expect(edited.status).toBe(1)
    expect(store.count).toBe(5)
  })

  it('applies plugin settings defaults and dispatches setPluginSettings on update', async () => {
    kit = createKit()
    const received: Array<{ key: string; value: unknown }> = []
    let api!: Parameters<Parameters<DevtoolsKit['plugins']['register']>[1]>[0]

    await kit.plugins.register(
      {
        id: 'plugin:settings',
        settings: {
          logStoreChanges: { label: 'Log store changes', type: 'boolean', defaultValue: true },
          orderBy: {
            label: 'Order by',
            type: 'choice',
            defaultValue: 'name',
            options: [
              { value: 'name', label: 'Name' },
              { value: 'time', label: 'Time' },
            ],
          },
        },
      },
      (pluginApi) => {
        api = pluginApi
        pluginApi.on.setPluginSettings((payload) => {
          received.push(payload as { key: string; value: unknown })
        })
      },
    )

    expect(api.getSettings()).toEqual({ logStoreChanges: true, orderBy: 'name' })

    const result = await kit.runtime.command({
      type: 'plugins:updateSetting',
      payload: { pluginId: 'plugin:settings', key: 'logStoreChanges', value: false },
    })
    expect(result.status).toBe(1)
    expect(received).toEqual([expect.objectContaining({ key: 'logStoreChanges', value: false })])
    expect(api.getSettings()).toEqual({ logStoreChanges: false, orderBy: 'name' })
  })

  it('adds component tree tags via visitComponentTree', async () => {
    kit = createKit()
    initApp(kit)

    await kit.plugins.register({ id: 'plugin:tags' }, (api) => {
      api.on.visitComponentTree((payload) => {
        const treeNode = payload.treeNode as { name?: string; tags: unknown[] }
        if (treeNode.name === 'FixtureRoot')
          treeNode.tags.push({ label: 'root', textColor: 0xffffff, backgroundColor: 0x42b883 })
      })
    })

    const tree = await kit.runtime.query({ appId: 'app:0', type: 'components:treeSnapshot' })

    expect(tree.nodes[0]).toMatchObject({
      name: 'FixtureRoot',
      tags: [expect.objectContaining({ label: 'root' })],
    })
  })

  it('preserves the complete v8 plugin descriptor contract', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    const componentStateTypes = ['Routing', '🍍 counter']

    const adapter = await kit.plugins.register(
      {
        id: 'plugin:v8-descriptor',
        label: 'V8 descriptor',
        app: fixture.app,
        componentStateTypes,
        disableAppScope: true,
        disablePluginScope: true,
        enableEarlyProxy: true,
      },
      () => {},
    )

    expect(adapter.descriptor).toMatchObject({
      componentStateTypes,
      disableAppScope: true,
      disablePluginScope: true,
      enableEarlyProxy: true,
    })
  })

  it('passes the v8 filter and supports direct visitComponentTree calls', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    const filters: string[] = []
    let api!: Parameters<Parameters<DevtoolsKit['plugins']['register']>[1]>[0]

    await kit.plugins.register({ id: 'plugin:router', app: fixture.app }, (pluginApi) => {
      api = pluginApi
      api.on.visitComponentTree((payload) => {
        filters.push(payload.filter)
      })
    })

    await kit.runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
      payload: { filter: 'router-view' },
    })
    await api.visitComponentTree({
      app: fixture.app,
      componentInstance: fixture.instances[0]!,
      treeNode: { id: 'manual' },
      filter: 'manual-filter',
    })

    expect(filters).toContain('router-view')
    expect(filters).toContain('manual-filter')
    expect(api.now()).toBeGreaterThan(1_000_000_000_000)
  })

  it('passes the complete editComponentState payload used by Pinia', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    const store = { state: { count: 1 } }
    let received: Record<string, unknown> | undefined

    await kit.plugins.register(
      {
        id: 'plugin:pinia',
        app: fixture.app,
        componentStateTypes: ['🍍 counter'],
      },
      (api) => {
        api.on.editComponentState((payload) => {
          received = payload as unknown as Record<string, unknown>
          if (payload.type === '🍍 counter') payload.set?.(store, payload.path, payload.state.value)
        })
      },
    )

    const tree = await kit.runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })
    const componentId = tree.nodes[0]!.id
    const result = await kit.runtime.command({
      appId: 'app:0',
      type: 'components:editState',
      payload: {
        componentId,
        sectionId: '🍍 counter',
        path: ['state', 'count'],
        value: 2,
      },
    })

    expect(result.status).toBe(1)
    expect(store.state.count).toBe(2)
    expect(received).toMatchObject({
      app: fixture.app,
      inspectorId: 'components',
      nodeId: componentId,
      componentInstance: fixture.instances[0],
      path: ['state', 'count'],
      type: '🍍 counter',
    })
    expect(received?.set).toBeTypeOf('function')
  })

  it('refreshes custom component state after a plugin edits directly', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    const store = { count: 1 }
    const invalidations = vi.fn()
    kit.runtime.subscribe('components:stateInvalidated', invalidations)
    await kit.plugins.register(
      { id: 'plugin:direct', app: fixture.app, componentStateTypes: ['custom'] },
      (api) => {
        api.on.editComponentState(async (payload) => {
          if (payload.type !== 'custom') return
          await Promise.resolve()
          store.count = payload.state.value as number
        })
      },
    )
    const componentId = kit.runtime.registry.getComponentId(fixture.instances[0]!)!
    const result = await kit.runtime.command({
      type: 'components:editState',
      appId: 'app:0',
      payload: {
        componentId,
        sectionId: 'custom',
        path: ['count'],
        value: 2,
      },
    })
    expect(result.status).toBe(1)
    expect(store.count).toBe(2)
    expect(invalidations).toHaveBeenCalledOnce()
  })

  it('passes the complete inspectTimelineEvent payload', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    let received: Record<string, unknown> | undefined

    await kit.plugins.register({ id: 'plugin:timeline', app: fixture.app }, (api) => {
      api.on.inspectTimelineEvent((payload) => {
        received = payload as unknown as Record<string, unknown>
      })
    })

    const event = {
      all: true,
      data: { kind: 'string', value: 'details' },
      time: Date.now(),
      title: 'navigation',
    }
    const result = await kit.runtime.command({
      appId: 'app:0',
      type: 'timeline:inspectEvent',
      payload: {
        pluginId: 'plugin:timeline',
        layerId: 'router:navigations',
        event,
      },
    })

    expect(result.status).toBe(1)
    expect(received).toMatchObject({
      app: fixture.app,
      appId: 'app:0',
      pluginId: 'plugin:timeline',
      layerId: 'router:navigations',
      event,
      all: true,
      data: event.data,
    })
  })

  it('uses the v8 settings payload and resolves settings by plugin id', async () => {
    kit = createKit()
    const fixture = initApp(kit)
    let received: Record<string, unknown> | undefined

    await kit.plugins.register(
      {
        id: 'plugin:settings-source',
        app: fixture.app,
        settings: {
          enabled: { label: 'Enabled', type: 'boolean', defaultValue: true },
        },
      },
      (api) => {
        api.on.setPluginSettings((payload) => {
          received = payload as unknown as Record<string, unknown>
        })
      },
    )

    let otherSettings: Record<string, unknown> | undefined
    await kit.plugins.register({ id: 'plugin:settings-consumer' }, (api) => {
      otherSettings = api.getSettings('plugin:settings-source')
    })

    expect(otherSettings).toEqual({ enabled: true })

    const result = await kit.runtime.command({
      type: 'plugins:updateSetting',
      payload: { pluginId: 'plugin:settings-source', key: 'enabled', value: false },
    })

    expect(result.status).toBe(1)
    expect(received).toMatchObject({
      app: fixture.app,
      pluginId: 'plugin:settings-source',
      key: 'enabled',
      oldValue: true,
      newValue: false,
      value: false,
      settings: { enabled: false },
    })
  })

  it('runs hooks on other apps only when disableAppScope is set', async () => {
    kit = createKit()
    const first = initApp(kit)
    const second = createComponentTreeFixture(1)
    kit.runtime.dispatch({
      type: 'app:init',
      app: second.app,
      time: 2,
      version: '3.5.0',
      vueTypes: {},
    })

    const seen: string[] = []
    await kit.plugins.register({ id: 'plugin:scoped', app: first.app }, (api) => {
      api.on.inspectComponent(() => {
        seen.push('scoped')
      })
    })
    await kit.plugins.register(
      { id: 'plugin:global', app: first.app, disableAppScope: true },
      (api) => {
        api.on.inspectComponent(() => {
          seen.push('global')
        })
      },
    )

    await kit.runtime.callPluginHook('inspectComponent', {
      app: second.app,
      componentInstance: second.instances[0],
      instanceData: {},
    })
    expect(seen).toEqual(['global'])

    seen.length = 0
    await kit.runtime.callPluginHook('inspectComponent', {
      app: first.app,
      componentInstance: first.instances[0],
      instanceData: {},
    })
    expect(seen).toEqual(['scoped', 'global'])
  })

  it('lists a disableAppScope inspector for every app', async () => {
    kit = createKit()
    const first = initApp(kit)
    const second = createComponentTreeFixture(1)
    kit.runtime.dispatch({
      type: 'app:init',
      app: second.app,
      time: 2,
      version: '3.5.0',
      vueTypes: {},
    })

    await kit.plugins.register({ id: 'plugin:scoped', app: first.app }, (api) => {
      api.addInspector({ id: 'scoped-inspector', label: 'Scoped' })
    })
    await kit.plugins.register(
      { id: 'plugin:global', app: first.app, disableAppScope: true },
      (api) => {
        api.addInspector({ id: 'global-inspector', label: 'Global' })
      },
    )

    const onFirst = await kit.runtime.query({ appId: 'app:0', type: 'inspectors:list' })
    const onSecond = await kit.runtime.query({ appId: 'app:1', type: 'inspectors:list' })

    expect(onFirst.inspectors.map((inspector) => inspector.id)).toEqual([
      'scoped-inspector',
      'global-inspector',
    ])
    expect(onSecond.inspectors.map((inspector) => inspector.id)).toEqual(['global-inspector'])
  })
})

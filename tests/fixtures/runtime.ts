import type {
  CustomInspectorOptions,
  TimelineEventOptions,
  TimelineLayerOptions,
} from '../../packages/kit/src/plugin/api'

export interface ComponentInstanceFixture {
  uid: number
  type: {
    name: string
    __file: string
    __isKeepAlive?: boolean
  }
  parent?: ComponentInstanceFixture
  subTree: {
    children: Array<{ component: ComponentInstanceFixture }>
  }
  __v_cache?: Map<string, { component: ComponentInstanceFixture }>
}

export interface AppFixture {
  _component: { name: string }
  _instance: ComponentInstanceFixture
}

export function createComponentTreeFixture(
  count: number,
  options: { appName?: string; branching?: number } = {},
): { app: AppFixture; instances: ComponentInstanceFixture[] } {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')

  const branching = Math.max(1, Math.floor(options.branching ?? 20))
  const instances = Array.from({ length: count }, (_, index): ComponentInstanceFixture => ({
    uid: index,
    type: {
      name: index === 0 ? 'FixtureRoot' : `FixtureComponent${index}`,
      __file: `/fixtures/FixtureComponent${index}.vue`,
    },
    subTree: { children: [] },
  }))

  for (let index = 1; index < instances.length; index += 1) {
    const parentIndex = Math.floor((index - 1) / branching)
    const parent = instances[parentIndex]!
    const instance = instances[index]!
    instance.parent = parent
    parent.subTree.children.push({ component: instance })
  }

  return {
    app: {
      _component: { name: options.appName ?? 'Fixture App' },
      _instance: instances[0]!,
    },
    instances,
  }
}

export function createMultiAppFixture(): AppFixture[] {
  return [
    createComponentTreeFixture(4, { appName: 'Primary App' }).app,
    createComponentTreeFixture(3, { appName: 'Secondary App' }).app,
  ]
}

export function createKeepAliveFixture(): {
  app: AppFixture
  active: ComponentInstanceFixture
  cached: ComponentInstanceFixture
} {
  const { app, instances } = createComponentTreeFixture(2, {
    appName: 'KeepAlive App',
    branching: 1,
  })
  const keepAlive = instances[1]!
  keepAlive.type.__isKeepAlive = true

  const active = createDetachedComponent(2, 'ActiveView', keepAlive)
  const cached = createDetachedComponent(3, 'CachedView', keepAlive)
  keepAlive.subTree.children = [{ component: active }]
  keepAlive.__v_cache = new Map([
    ['active', { component: active }],
    ['cached', { component: cached }],
  ])

  return { active, app, cached }
}

export function createDeepCyclicStateFixture(depth = 50): Record<string, unknown> {
  const root: Record<string, unknown> = { label: 'root' }
  let current = root

  for (let index = 0; index < depth; index += 1) {
    const child: Record<string, unknown> = { index }
    current.child = child
    current = child
  }

  current.root = root
  return root
}

export function createCustomInspectorFixture(): {
  options: CustomInspectorOptions
  rootNodes: Array<{ id: string; label: string }>
  state: Record<string, Array<{ key: string; value: unknown; editable: boolean }>>
} {
  return {
    options: {
      icon: 'storage',
      id: 'fixture-inspector',
      label: 'Fixture Inspector',
      stateFilterPlaceholder: 'Filter fixture state...',
      treeFilterPlaceholder: 'Filter fixture nodes...',
    },
    rootNodes: [{ id: 'fixture-node', label: 'Fixture Node' }],
    state: {
      state: [{ editable: true, key: 'enabled', value: true }],
    },
  }
}

export function createTimelinePluginFixture(): {
  event: TimelineEventOptions
  layer: TimelineLayerOptions
} {
  const layer: TimelineLayerOptions = {
    color: 0x42b883,
    id: 'fixture:requests',
    label: 'Fixture Requests',
  }

  return {
    event: {
      event: {
        data: { method: 'GET', status: 200 },
        time: 1_000,
        title: 'GET /fixture',
      },
      layerId: layer.id,
    },
    layer,
  }
}

function createDetachedComponent(
  uid: number,
  name: string,
  parent: ComponentInstanceFixture,
): ComponentInstanceFixture {
  return {
    parent,
    subTree: { children: [] },
    type: { __file: `/fixtures/${name}.vue`, name },
    uid,
  }
}

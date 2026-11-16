// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../packages/kit/src/runtime/runtime'
import { createComponentTreeFixture } from '../../fixtures'
import { measureRuntimeMessageBytes } from '../../../packages/kit/src/rpc/event-buffer'
import { ComponentDomOrderCache } from '../../../packages/kit/src/runtime/registry'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'
import { buildComponentTree } from '../../../packages/client/src/composables/component-tree'

let runtime: DevtoolsRuntime
afterEach(() => {
  runtime?.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function setup(count: number, maxMessageBytes = 2 * 1024 * 1024) {
  const fixture = createComponentTreeFixture(count + 1, { branching: count })
  const parent = document.createElement('section')
  document.body.append(parent)
  Object.assign(fixture.instances[0]!.subTree, { el: parent })
  for (const instance of fixture.instances.slice(1)) {
    const el = document.createElement('article')
    parent.append(el)
    Object.assign(instance.subTree, { el })
  }
  runtime = createDevtoolsRuntime({
    budget: {
      components: { maxInitialDepth: 0 },
      transport: { maxMessageBytes },
    },
  })
  runtime.dispatch({ type: 'app:init', app: fixture.app, version: '3.5.0', vueTypes: {}, time: 1 })
  return fixture
}

async function firstPage() {
  const initial = await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
  const componentId = initial.nodes[0]!.id
  const page = await runtime.query({
    type: 'components:treeChildren',
    appId: 'app:0',
    payload: { componentId },
  })
  return { componentId, page }
}

describe('bounded component expansion', () => {
  it('keeps unloaded siblings expandable after a revealed child unmounts', async () => {
    const fixture = setup(10)
    let nodes = (await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })).nodes
    const root = fixture.instances[0]!
    const child = fixture.instances[1]!
    const record = runtime.registry.ensureComponent('app:0', child, root, 2)!
    nodes = runtime.components.revealPath('app:0', record.id)
    runtime.subscribe('components:treePatched', (event) => {
      nodes = applyComponentTreePatches(nodes, event.patches)
    })
    root.subTree.children = root.subTree.children.filter(({ component }) => component !== child)
    runtime.dispatch({ type: 'component:remove', appId: 'app:0', instance: child, time: 3 })
    expect(nodes[0]!.childCount).toBe(9)
    expect(buildComponentTree(nodes, '')[0]!.hasChildren).toBe(true)
    expect(runtime.registry.getApp('app:0')?.components.size).toBeLessThan(11)
  })

  it.each(['loaded', 'pending'] as const)(
    'preserves the full child count when %s children unmount after cancellation',
    async (kind) => {
      const fixture = setup(1000)
      let nodes = (await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })).nodes
      const componentId = nodes[0]!.id
      runtime.subscribe('components:treePatched', (event) => {
        nodes = applyComponentTreePatches(nodes, event.patches)
      })
      const page = await runtime.query({
        type: 'components:treeChildren',
        appId: 'app:0',
        payload: { componentId },
      })
      nodes = applyComponentTreePatches(
        nodes,
        page.nodes.map((node) => ({ op: 'insert', node, parentId: componentId })),
      )
      await runtime.command({
        type: 'components:cancelTreeChildren',
        appId: 'app:0',
        payload: { cursor: page.cursor! },
      })
      const removed =
        kind === 'loaded'
          ? fixture.instances.slice(1, page.nodes.length + 1)
          : fixture.instances.slice(page.nodes.length + 1)
      const removedSet = new Set(removed)
      fixture.instances[0]!.subTree.children = fixture.instances[0]!.subTree.children.filter(
        ({ component }) => !removedSet.has(component),
      )
      for (const instance of removed) {
        Object.assign(instance, { isUnmounted: true })
        runtime.dispatch({ type: 'component:remove', appId: 'app:0', instance, time: 2 })
      }
      expect(nodes[0]!.childCount).toBe(1000 - removed.length)
      expect(buildComponentTree(nodes, '')[0]!.hasChildren).toBe(true)
      const remaining = new Set<string>()
      let cursor: string | undefined
      do {
        const next = await runtime.query({
          type: 'components:treeChildren',
          appId: 'app:0',
          payload: { componentId, cursor },
        })
        next.nodes.forEach((node) => remaining.add(node.id))
        cursor = next.cursor
      } while (cursor)
      expect(remaining.size).toBe(1000 - removed.length)
    },
  )

  it('does not shrink or double count a partial tree on updates and repeated adds', async () => {
    const fixture = setup(1000)
    let nodes = (await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })).nodes
    runtime.subscribe('components:treePatched', (event) => {
      nodes = applyComponentTreePatches(nodes, event.patches)
    })
    await runtime.query({
      type: 'components:treeChildren',
      appId: 'app:0',
      payload: { componentId: nodes[0]!.id },
    })
    const instance = fixture.instances[999]!
    for (let time = 2; time < 5; time++) {
      runtime.dispatch({
        type: 'component:add',
        appId: 'app:0',
        instance,
        parent: instance.parent,
        time,
      })
      expect(nodes[0]!.childCount).toBe(1000)
    }
  })

  it('invalidates DOM order for a same-task reorder before observer delivery', () => {
    const parent = document.createElement('section')
    const first = document.createElement('div')
    const second = document.createElement('div')
    parent.append(first, second)
    const cache = new ComponentDomOrderCache(true)
    expect(cache.indexOf(parent, second)).toBe(1)
    parent.prepend(second)
    cache.preparePage()
    expect(cache.indexOf(parent, second)).toBe(0)
    expect(cache.indexOf(parent, first)).toBe(1)
    cache.dispose()
  })

  it('delivers all 20k real DOM siblings with bounded replies and state available between pages', async () => {
    setup(20_000)
    const first = await firstPage()
    let page = first.page
    const ids = new Set<string>()
    let pages = 0
    while (true) {
      pages++
      expect(page.nodes.length).toBeLessThanOrEqual(256)
      expect(measureRuntimeMessageBytes(page)).toBeLessThanOrEqual(128 * 1024)
      for (const node of page.nodes) ids.add(node.id)
      if (pages === 1) {
        const state = await runtime.query({
          type: 'components:stateSnapshot',
          appId: 'app:0',
          payload: { componentId: page.nodes[0]!.id },
        })
        expect(state?.componentId).toBe(page.nodes[0]!.id)
      }
      if (!page.cursor) break
      page = await runtime.query({
        type: 'components:treeChildren',
        appId: 'app:0',
        payload: { componentId: first.componentId, cursor: page.cursor },
      })
    }
    expect(ids.size).toBe(20_000)
    expect(pages).toBeGreaterThan(1)
  })

  it('can cancel and restart without losing nodes already marked visible', async () => {
    setup(1000)
    const { componentId, page } = await firstPage()
    await runtime.command({
      type: 'components:cancelTreeChildren',
      appId: 'app:0',
      payload: { cursor: page.cursor! },
    })
    await expect(
      runtime.query({
        type: 'components:treeChildren',
        appId: 'app:0',
        payload: { componentId, cursor: page.cursor },
      }),
    ).rejects.toThrow('expired')
    const retry = await runtime.query({
      type: 'components:treeChildren',
      appId: 'app:0',
      payload: { componentId },
    })
    expect(retry.nodes[0]!.id).toBe(page.nodes[0]!.id)
  })

  it('skips children unmounted while another page is in flight', async () => {
    const fixture = setup(1000)
    const { componentId, page } = await firstPage()
    for (const instance of fixture.instances.slice(1))
      Object.assign(instance, { isUnmounted: true })
    let cursor = page.cursor
    const remaining: string[] = []
    while (cursor) {
      const next = await runtime.query({
        type: 'components:treeChildren',
        appId: 'app:0',
        payload: { componentId, cursor },
      })
      remaining.push(...next.nodes.map((node) => node.id))
      cursor = next.cursor
    }
    expect(remaining).toEqual([])
  })

  it('bounds bytes even with a small transport limit and independent clients', async () => {
    setup(1000, 1024)
    const { componentId, page } = await firstPage()
    const second = await runtime.query({
      type: 'components:treeChildren',
      appId: 'app:0',
      payload: { componentId },
    })
    expect(second.nodes[0]!.id).toBe(page.nodes[0]!.id)
    expect(second.cursor).not.toBe(page.cursor)
    expect(measureRuntimeMessageBytes(page)).toBeLessThanOrEqual(1024)
    expect(measureRuntimeMessageBytes(second)).toBeLessThanOrEqual(1024)
  })

  it('recomputes DOM order after an equal-length reorder between requests', async () => {
    setup(1000)
    const { componentId, page } = await firstPage()
    const parent = document.querySelector('section')!
    const nextElement = parent.children[page.nodes.length]!
    parent.prepend(nextElement)
    const next = await runtime.query({
      type: 'components:treeChildren',
      appId: 'app:0',
      payload: { componentId, cursor: page.cursor },
    })
    expect(next.nodes[0]!.domOrder).toEqual([0])
  })
})

// The pre-P2b implementation is the behavioral oracle, including observer timing.
class LegacyDomOrderCache {
  private parents = new WeakMap<Element, Map<Node, number>>()
  private observer = new MutationObserver((records) => this.invalidate(records))

  private invalidate(records: MutationRecord[]) {
    for (const record of records) this.parents.delete(record.target as Element)
  }

  preparePage() {
    this.invalidate(this.observer.takeRecords())
  }

  indexOf(parent: Element, node: Node) {
    let indices = this.parents.get(parent)
    if (!indices) {
      indices = new Map()
      const children = parent.childNodes
      for (let index = 0; index < children.length; index++) indices.set(children[index]!, index)
      this.parents.set(parent, indices)
      this.observer.observe(parent, { childList: true })
    }
    return indices.get(node) ?? -1
  }

  dispose() {
    this.observer.disconnect()
    this.parents = new WeakMap()
  }
}

// happy-dom omits previousSibling/nextSibling from child-list records. Supply
// spec-shaped records for incremental-path tests; native timing is covered above.
function recordedMutations() {
  const observers = new Set<RecordedObserver>()
  class RecordedObserver {
    targets = new Set<Node>()
    records: MutationRecord[] = []
    constructor(readonly callback: MutationCallback) {
      observers.add(this)
    }
    observe(target: Node) {
      this.targets.add(target)
    }
    takeRecords() {
      return this.records.splice(0)
    }
    disconnect() {
      observers.delete(this)
    }
  }
  vi.stubGlobal('MutationObserver', RecordedObserver)
  function record(
    parent: Node,
    node: Node,
    previousSibling: Node | null,
    nextSibling: Node | null,
    added: boolean,
  ) {
    for (const observer of observers) {
      if (observer.targets.has(parent))
        observer.records.push({
          type: 'childList',
          target: parent,
          previousSibling,
          nextSibling,
          addedNodes: added ? [node] : [],
          removedNodes: added ? [] : [node],
        } as unknown as MutationRecord)
    }
  }
  function remove(node: Node) {
    const parent = node.parentNode
    if (!parent) return
    record(parent, node, node.previousSibling, node.nextSibling, false)
    parent.removeChild(node)
  }
  function insert(parent: Node, node: Node, anchor: Node | null) {
    if (node === anchor) return
    remove(node)
    record(parent, node, anchor ? anchor.previousSibling : parent.lastChild, anchor, true)
    parent.insertBefore(node, anchor)
  }
  function deliver() {
    for (const observer of observers)
      observer.callback(observer.takeRecords(), observer as unknown as MutationObserver)
  }
  return { insert, remove, deliver }
}

describe('incremental DOM order cache', () => {
  it('rescans a stale index inside the rebuilt prefix', () => {
    const mutations = recordedMutations()
    const parent = document.createElement('div')
    const first = document.createElement('i')
    const second = document.createElement('b')
    const inserted = document.createElement('em')
    parent.append(first, second)
    const cache = new ComponentDomOrderCache(true)
    try {
      expect(cache.indexOf(parent, second)).toBe(1)
      mutations.insert(parent, inserted, second)
      cache.preparePage()
      expect(cache.indexOf(parent, inserted)).toBe(1)
      expect(cache.indexOf(parent, second)).toBe(2)
      parent.prepend(second)
      expect(cache.indexOf(parent, first)).toBe(1)
    } finally {
      cache.dispose()
    }
  })

  it('matches the old cache through batched insertions, removals and cross-parent moves', async () => {
    const mutations = recordedMutations()
    const cache = new ComponentDomOrderCache(true)
    const legacy = new LegacyDomOrderCache()
    const parents = [document.createElement('div'), document.createElement('div')]
    const nodes = Array.from({ length: 60 }, (_, i) =>
      i % 3 === 0
        ? document.createComment('anchor')
        : i % 3 === 1
          ? document.createTextNode('')
          : document.createElement('i'),
    )
    parents[0]!.append(...nodes.slice(0, 30))
    parents[1]!.append(...nodes.slice(30))
    let seed = 1729
    const random = (max: number) => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % max
    try {
      for (let round = 0; round < 300; round++) {
        for (let step = 0; step < 1 + (round % 7); step++) {
          const parent = parents[random(2)]!
          const node = nodes[random(nodes.length)]!
          if (random(4) === 0) mutations.remove(node)
          else
            mutations.insert(
              parent,
              node,
              parent.childNodes[random(parent.childNodes.length + 1)] ?? null,
            )
          if (step % 2 === 0) {
            cache.preparePage()
            legacy.preparePage()
            const queried = nodes[random(nodes.length)]!
            expect(cache.indexOf(parent, queried)).toBe(legacy.indexOf(parent, queried))
          }
        }
        // Exercise both synchronous takeRecords and delivered observer callbacks.
        if (round % 30 === 0) {
          await Promise.resolve()
          mutations.deliver()
        }
        cache.preparePage()
        legacy.preparePage()
        for (const parent of parents) {
          for (const node of nodes)
            expect(cache.indexOf(parent, node)).toBe(legacy.indexOf(parent, node))
        }
      }
    } finally {
      cache.dispose()
      legacy.dispose()
    }
  })

  it('keeps an unobserved traversal snapshot until the next page', () => {
    const parent = document.createElement('div')
    const first = document.createElement('i')
    const second = document.createElement('b')
    parent.append(first, second)
    const cache = new ComponentDomOrderCache()
    expect(cache.indexOf(parent, first)).toBe(0)
    parent.prepend(second)
    expect(cache.indexOf(parent, first)).toBe(0)
    cache.preparePage()
    expect(cache.indexOf(parent, first)).toBe(1)
    cache.dispose()
  })

  it.each(['forward', 'reverse'] as const)(
    'reads linearly during %s insertions into a large parent',
    (direction) => {
      const mutations = recordedMutations()
      function reads(count: number) {
        const parent = document.createElement('div')
        parent.append(...Array.from({ length: count }, () => document.createElement('i')))
        let anchor: Node = parent.childNodes[count / 2]!
        const children = parent.childNodes
        let indexedReads = 0
        let measuring = false
        const proxy = new Proxy(children, {
          get(target, property, receiver) {
            if (measuring && typeof property === 'string' && /^\d+$/.test(property)) indexedReads++
            return Reflect.get(target, property, receiver)
          },
        })
        Object.defineProperty(parent, 'childNodes', { configurable: true, get: () => proxy })
        const cache = new ComponentDomOrderCache(true)
        try {
          for (let i = 0; i < count; i++) {
            const node = document.createElement('b')
            mutations.insert(parent, node, anchor)
            measuring = true
            cache.preparePage()
            expect(cache.indexOf(parent, node)).toBe(count / 2 + (direction === 'forward' ? i : 0))
            measuring = false
            if (direction === 'reverse') anchor = node
          }
          return indexedReads
        } finally {
          cache.dispose()
        }
      }
      const small = reads(1000)
      const large = reads(2000)
      expect(large / small).toBeLessThan(2.1)
      expect(large).toBeLessThan(2000 * 5)
    },
  )
})

it.each(['Fragment', 'Teleport', 'KeepAlive', 'Vapor'] as const)(
  'emits the old domOrder and reorder sequence for %s roots',
  async (kind) => {
    const fixture = createComponentTreeFixture(4, { branching: 3 })
    const root = fixture.instances[0]!
    const parent = document.createElement('section')
    const target = document.createElement('aside')
    const storage = document.createElement('div')
    document.body.append(parent, target)
    Object.assign(root.subTree, { el: parent })
    const elements = fixture.instances.slice(1).map((instance) => {
      const el = document.createElement('article')
      const anchor = document.createComment('fragment')
      const container = kind === 'Teleport' ? target : parent
      container.append(anchor, el, document.createTextNode(''))
      if (kind === 'Vapor') Object.assign(instance, { vapor: true, block: [anchor, el] })
      else Object.assign(instance.subTree, { el: anchor, children: [{ el }] })
      return el
    })
    if (kind === 'KeepAlive') Object.assign(root.type, { __isKeepAlive: true })

    async function run() {
      const mutations = recordedMutations()
      const container = kind === 'Teleport' ? target : parent
      container.replaceChildren(...elements)
      for (const instance of fixture.instances) Object.assign(instance, { isDeactivated: false })
      const current = createDevtoolsRuntime({ budget: { components: { maxInitialDepth: 10 } } })
      const emitted: string[] = []
      const checkpoints: string[] = []
      current.subscribe('components:treePatched', (event) => emitted.push(JSON.stringify(event)))
      try {
        current.dispatch({
          type: 'app:init',
          app: fixture.app,
          version: '3.6.0',
          vueTypes: {},
          time: 1,
        })
        await current.query({ type: 'components:treeSnapshot', appId: 'app:0' })
        for (let step = 0; step < 4; step++) {
          const node = elements[step % elements.length]!
          if (kind === 'KeepAlive' && step === 1) {
            mutations.insert(storage, node, null)
            Object.assign(fixture.instances[(step % elements.length) + 1]!, { isDeactivated: true })
          } else {
            mutations.insert(container, node, container.firstChild)
            Object.assign(fixture.instances[(step % elements.length) + 1]!, {
              isDeactivated: false,
            })
          }
          current.dispatch({
            type: 'component:update',
            appId: 'app:0',
            instance: root,
            time: step + 2,
          })
          // Capture before and after the scheduler: content and emission timing.
          checkpoints.push(JSON.stringify(emitted))
          await current.scheduler.flush()
          checkpoints.push(JSON.stringify(emitted))
          checkpoints.push(JSON.stringify(current.components.snapshot().nodes))
        }
        expect(emitted.some((event) => event.includes('"op":"reorder"'))).toBe(true)
        return checkpoints
      } finally {
        current.dispose()
        vi.unstubAllGlobals()
      }
    }

    vi.spyOn(Date, 'now').mockReturnValue(100)
    const actual = await run()
    const caches = new WeakMap<ComponentDomOrderCache, LegacyDomOrderCache>()
    function old(cache: ComponentDomOrderCache) {
      let legacy = caches.get(cache)
      if (!legacy) {
        legacy = new LegacyDomOrderCache()
        caches.set(cache, legacy)
      }
      return legacy
    }
    vi.spyOn(ComponentDomOrderCache.prototype, 'indexOf').mockImplementation(function (
      this: ComponentDomOrderCache,
      parent,
      node,
    ) {
      return old(this).indexOf(parent, node)
    })
    vi.spyOn(ComponentDomOrderCache.prototype, 'preparePage').mockImplementation(function (
      this: ComponentDomOrderCache,
    ) {
      old(this).preparePage()
    })
    vi.spyOn(ComponentDomOrderCache.prototype, 'dispose').mockImplementation(function (
      this: ComponentDomOrderCache,
    ) {
      old(this).dispose()
    })
    expect(actual).toEqual(await run())
  },
)

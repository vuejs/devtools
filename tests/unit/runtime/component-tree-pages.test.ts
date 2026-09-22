// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
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

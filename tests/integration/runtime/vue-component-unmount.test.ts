// @vitest-environment happy-dom

import type { App } from 'vue'
import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createApp, defineComponent, h, KeepAlive, nextTick, ref, setDevtoolsHook } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

let app: App | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  installed?.dispose()
  runtime?.dispose()
  container?.remove()
  // Vue caches its hook separately from the global property.
  setDevtoolsHook(undefined!, {})
  vi.unstubAllGlobals()
})

async function mountRoutes(keepAlive = false) {
  const route = ref('first')
  const count = ref(0)
  const Leaf = defineComponent({
    name: 'RouteLeaf',
    props: ['count'],
    render() {
      return h('span', String(this.count))
    },
  })
  const First = defineComponent({
    name: 'FirstRoute',
    setup: () => () => h(Leaf, { count: count.value }),
  })
  const Second = defineComponent({ name: 'SecondRoute', setup: () => () => h('p', 'Second route') })
  runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 50 } } })
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  app = createApp({
    name: 'RouteTestApp',
    setup: () => () =>
      keepAlive
        ? h(KeepAlive, null, { default: () => h(route.value === 'first' ? First : Second) })
        : h(route.value === 'first' ? First : Second),
  })
  setDevtoolsHook(installed.hook as unknown as Parameters<typeof setDevtoolsHook>[0], globalThis)
  container = document.createElement('div')
  document.body.append(container)
  app.mount(container)
  await nextTick()

  let nodes: ComponentTreeNodeSnapshot[] = runtime.components.snapshot().nodes
  runtime.subscribe('components:treePatched', (event) => {
    nodes = applyComponentTreePatches(nodes, event.patches)
  })
  return { route, count, nodes: () => nodes, names: () => nodes.map((node) => node.name) }
}

describe('real Vue component unmount notifications', () => {
  it('keeps deactivated KeepAlive instances until the app is unmounted', async () => {
    const fixture = await mountRoutes(true)
    const removed = vi.fn()
    installed!.hook.on('component:removed', removed)
    fixture.route.value = 'second'
    await nextTick()
    await runtime!.scheduler.flush()
    expect(removed).not.toHaveBeenCalled()
    expect(
      runtime!.components.snapshot().nodes.find((node) => node.name === 'FirstRoute')?.inactive,
    ).toBe(true)

    app!.unmount()
    app = undefined
    await nextTick()
    expect(runtime!.registry.listApps()).toEqual([])
  })

  it('removes an unmounted route and its descendants through Vue hook events', async () => {
    const fixture = await mountRoutes()
    const removed = vi.fn()
    installed!.hook.on('component:removed', removed)
    expect(fixture.names()).toEqual(['RouteTestApp', 'FirstRoute', 'RouteLeaf'])

    fixture.route.value = 'second'
    await nextTick()
    await runtime!.scheduler.flush()

    expect(removed).toHaveBeenCalledTimes(2)
    expect(container!.textContent).toBe('Second route')
    expect(fixture.names()).toEqual(['RouteTestApp', 'SecondRoute'])
  })

  it('does not accumulate old route instances after repeated switches', async () => {
    const fixture = await mountRoutes()
    for (let index = 0; index < 3; index++) {
      fixture.route.value = 'second'
      await nextTick()
      await runtime!.scheduler.flush()
      expect(fixture.names()).toEqual(['RouteTestApp', 'SecondRoute'])
      fixture.route.value = 'first'
      await nextTick()
      await runtime!.scheduler.flush()
      // A new route instance starts collapsed; expand its children on demand.
      const first = fixture.nodes().find((node) => node.name === 'FirstRoute')!
      await runtime!.command({
        type: 'components:expandTreeNode',
        appId: first.appId,
        payload: { componentId: first.id },
      })
      expect(fixture.names()).toEqual(['RouteTestApp', 'FirstRoute', 'RouteLeaf'])
    }
  })

  it('does not resurrect removed components when an older update is still debounced', async () => {
    const fixture = await mountRoutes()
    fixture.count.value++
    await nextTick()
    fixture.route.value = 'second'
    await nextTick()
    await runtime!.scheduler.flush()

    expect(fixture.names()).toEqual(['RouteTestApp', 'SecondRoute'])
    expect(
      [...runtime!.registry.listApps()[0]!.components.values()].map((node) => node.name),
    ).not.toContain('FirstRoute')
  })
})

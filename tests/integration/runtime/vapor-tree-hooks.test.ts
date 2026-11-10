// @vitest-environment happy-dom

import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createComponent,
  createFor,
  createIf,
  insert,
  createVaporApp,
  defineVaporComponent,
  nextTick,
  ref,
  setDevtoolsHook,
  template,
  VaporKeepAlive,
  VaporTeleport,
  renderEffect,
  setText,
  txt,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

let app: { mount: (el: Element) => unknown; unmount: () => void } | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  installed?.dispose()
  runtime?.dispose()
  setDevtoolsHook(undefined!, {})
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function mount(Root: object) {
  runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 0 } } })
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  setDevtoolsHook(installed.hook as never, globalThis)
  app = createVaporApp(Root)
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  await nextTick()

  let nodes: ComponentTreeNodeSnapshot[] = runtime.components.snapshot().nodes
  runtime.subscribe('components:treePatched', (event) => {
    nodes = applyComponentTreePatches(nodes, event.patches)
  })
  return { nodes: () => nodes }
}

async function settle() {
  await nextTick()
  await runtime!.scheduler.flush()
}

describe('Vapor tree via devtools hooks', () => {
  it('keeps element-inserted descendants of a deactivated kept-alive component', async () => {
    const show = ref(true)
    const Leaf = defineVaporComponent({ name: 'Leaf', setup: () => template('<b></b>')() })
    const Cached = defineVaporComponent({
      name: 'Cached',
      setup: () => {
        const div = template('<div></div>')() as Element
        insert(createComponent(Leaf) as never, div)
        return div
      },
    })
    await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () =>
          createComponent(VaporKeepAlive, null, {
            default: () =>
              createIf(
                () => show.value,
                () => createComponent(Cached),
              ),
          }),
      }),
    )
    show.value = false
    await settle()
    // `Leaf` sits below the initial depth, so check the collapsed node's child count.
    const cached = runtime!.components.snapshot().nodes.find((node) => node.name === 'Cached')
    expect(cached).toMatchObject({ inactive: true, childCount: 1 })
  })

  it('keeps children inserted into an element at initial mount', async () => {
    // Compiled `<div><Child /></div>`: `Child` is not in the root block and its
    // `component:added` fires before `app:init`.
    const Child = defineVaporComponent({ name: 'Child', setup: () => template('<b></b>')() })
    const tree = await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () => {
          const div = template('<div></div>')() as Element
          insert(createComponent(Child) as never, div)
          return div
        },
      }),
    )
    expect(tree.nodes().map((node) => node.name)).toEqual(['Root', 'Child'])
  })

  it('adds and removes v-if / v-for children', async () => {
    const show = ref(true)
    const items = ref([1, 2])
    const Leaf = defineVaporComponent({ name: 'Leaf', setup: () => template('<b></b>')() })
    const Item = defineVaporComponent({ name: 'Item', setup: () => template('<i></i>')() })
    const tree = await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () => [
          createIf(
            () => show.value,
            () => createComponent(Leaf),
          ),
          createFor(
            () => items.value,
            () => createComponent(Item),
            (item: number) => item,
          ),
        ],
      }),
    )
    const names = () => tree.nodes().map((node) => node.name)
    expect(names()).toEqual(['Root', 'Leaf', 'Item', 'Item'])

    show.value = false
    items.value = [1, 2, 3]
    await settle()
    expect(names().sort()).toEqual(['Item', 'Item', 'Item', 'Root'])
  })

  it('orders v-for children by DOM position after a reorder', async () => {
    const items = ref(['a', 'b', 'c'])
    const Item = defineVaporComponent({ name: 'Item', setup: () => template('<i></i>')() })
    await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () =>
          createFor(
            () => items.value,
            () => createComponent(Item),
            (item: string) => item,
          ),
      }),
    )
    const keys = () =>
      runtime!.components
        .snapshot()
        .nodes.filter((node) => node.name === 'Item')
        .map((node) => node.renderKey)
    expect(keys()).toEqual(["'a'", "'b'", "'c'"])

    items.value = ['c', 'b', 'a']
    await settle()
    expect(keys()).toEqual(["'c'", "'b'", "'a'"])
  })

  it('follows a v-for reorder in the live tree without a new snapshot', async () => {
    const items = ref(['a', 'b', 'c'])
    const Item = defineVaporComponent({ name: 'Item', setup: () => template('<i></i>')() })
    const tree = await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () =>
          createFor(
            () => items.value,
            () => createComponent(Item),
            (item: string) => item,
          ),
      }),
    )
    const keys = () =>
      tree
        .nodes()
        .filter((node) => node.name === 'Item')
        .map((node) => node.renderKey)
    expect(keys()).toEqual(["'a'", "'b'", "'c'"])

    items.value = ['c', 'b', 'a']
    await settle()
    expect(keys()).toEqual(["'c'", "'b'", "'a'"])
  })

  it('records Vapor emits on the component events timeline layer', async () => {
    let emitChange: (() => void) | undefined
    const Child = defineVaporComponent({
      name: 'Child',
      emits: ['change'],
      setup: (_: unknown, { emit }: { emit: (event: string, ...args: unknown[]) => void }) => {
        emitChange = () => emit('change', 1, 'two')
        return template('<i></i>')()
      },
    } as never)
    await mount(defineVaporComponent({ name: 'Root', setup: () => createComponent(Child) }))
    const events = vi.fn()
    const emits = vi.fn()
    runtime!.subscribe('timeline:eventAdded', events)
    runtime!.subscribe('component:emit', emits)

    emitChange!()
    await settle()

    const childId = runtime!.components.snapshot().nodes.find((node) => node.name === 'Child')!.id
    const emitted = events.mock.calls
      .map(([event]) => event)
      .filter((event) => event.layerId === 'component-event')
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ title: 'change', subtitle: 'by Child' })
    // `meta` is an encoded value; check the component id made it through.
    expect(JSON.stringify(emitted[0].meta)).toContain(JSON.stringify(childId))
    expect(emits).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'change', args: [1, 'two'] }),
    )
  })

  it('keeps the teleport tag when a teleported Vapor component updates', async () => {
    const count = ref(0)
    const Leaf = defineVaporComponent({
      name: 'Leaf',
      setup: () => {
        const node = template('<b> </b>')() as ParentNode
        const text = txt(node) as Text
        renderEffect(() => setText(text, String(count.value)))
        return node
      },
    })
    const tree = await mount(
      defineVaporComponent({
        name: 'Root',
        setup: () =>
          createComponent(
            VaporTeleport,
            { to: () => 'body' },
            { default: () => createComponent(Leaf) },
          ),
      }),
    )
    const leafTags = () =>
      tree
        .nodes()
        .find((node) => node.name === 'Leaf')
        ?.tags?.map((tag) => tag.label)
    expect(leafTags()).toEqual(['teleport'])

    count.value++
    await settle()
    expect(document.body.textContent).toContain('1')
    expect(leafTags()).toEqual(['teleport'])
  })
})

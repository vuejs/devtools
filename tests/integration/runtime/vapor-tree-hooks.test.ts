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
  createVaporApp,
  defineVaporComponent,
  nextTick,
  ref,
  setDevtoolsHook,
  template,
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
})

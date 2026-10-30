// @vitest-environment happy-dom

import type { App } from 'vue'
import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createApp, defineComponent, h, nextTick, ref, setDevtoolsHook } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

let app: App | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined

afterEach(() => {
  app?.unmount()
  installed?.dispose()
  runtime?.dispose()
  setDevtoolsHook(undefined!, {})
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('live component tree order', () => {
  it('follows a keyed reorder without a new snapshot', async () => {
    runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 0 } } })
    installed = installDevtoolsHook({ runtime, target: {} })
    vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
    setDevtoolsHook(installed.hook as never, globalThis)

    const items = ref(['a', 'b', 'c'])
    const Item = defineComponent({ name: 'Item', render: () => h('i') })
    app = createApp({
      name: 'Root',
      render: () =>
        h(
          'div',
          items.value.map((key) => h(Item, { key })),
        ),
    })
    const el = document.createElement('div')
    document.body.append(el)
    app.mount(el)
    await nextTick()

    let nodes: ComponentTreeNodeSnapshot[] = runtime.components.snapshot().nodes
    runtime.subscribe('components:treePatched', (event) => {
      nodes = applyComponentTreePatches(nodes, event.patches)
    })
    const keys = () => nodes.filter((node) => node.name === 'Item').map((node) => node.renderKey)
    expect(keys()).toEqual(["'a'", "'b'", "'c'"])

    items.value = ['c', 'b', 'a']
    await nextTick()
    await runtime.scheduler.flush()
    expect(keys()).toEqual(["'c'", "'b'", "'a'"])
  })
})

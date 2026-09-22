// @vitest-environment happy-dom

import type { App, Component } from 'vue'
import type { EncodedValue } from '../../../packages/kit/src/codec'
import type { ComponentStateSnapshotMessage } from '../../../packages/kit/src/protocol'
import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createApp, defineComponent, h, nextTick, reactive, ref, setDevtoolsHook } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

// https://github.com/vuejs/devtools/issues/853
// JSX `defineComponent` setups compile to the same render-function return as `h()`.

let app: App | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  installed?.dispose()
  runtime?.dispose()
  container?.remove()
  setDevtoolsHook(undefined!, {})
  vi.unstubAllGlobals()
  app = undefined
  runtime = undefined
  installed = undefined
  container = undefined
})

describe('JSX defineComponent setup state', () => {
  it('shows ref and reactive data when defineComponent setup returns an object', async () => {
    // https://github.com/vuejs/devtools/issues/853
    const snapshot = await snapshotNamedComponent(
      'JsxObjectSetup',
      defineComponent({
        name: 'JsxObjectSetup',
        setup() {
          const count = ref(0)
          const state = reactive({ n: 1 })
          return { count, state }
        },
        render() {
          return h('div', `${this.count}:${this.state.n}`)
        },
      }),
    )

    expectSetupBindings(snapshot, { count: 0, n: 1 })
  })

  it('shows expose() ref and reactive data from a JSX-style setup render function', async () => {
    const snapshot = await snapshotNamedComponent(
      'JsxRenderExposed',
      defineComponent({
        name: 'JsxRenderExposed',
        setup(_, { expose }) {
          const count = ref(0)
          const state = reactive({ n: 1 })
          expose({ count, state })
          return () => h('div', `${count.value}:${state.n}`)
        },
      }),
    )

    expectSetupBindings(snapshot, { count: 0, n: 1 })
  })

  it('shows expose() bindings from a functional defineComponent setup', async () => {
    const snapshot = await snapshotNamedComponent(
      'JsxFunctionalExposed',
      defineComponent(
        (_, { expose }) => {
          const count = ref(0)
          const state = reactive({ n: 1 })
          expose({ count, state })
          return () => h('div', `${count.value}:${state.n}`)
        },
        { name: 'JsxFunctionalExposed' },
      ),
    )

    expectSetupBindings(snapshot, { count: 0, n: 1 })
  })
})

async function snapshotNamedComponent(
  name: string,
  component: Component,
): Promise<ComponentStateSnapshotMessage> {
  runtime = createDevtoolsRuntime({ budget: { components: { updateDebounceMs: 0 } } })
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  setDevtoolsHook(installed.hook as unknown as Parameters<typeof setDevtoolsHook>[0], globalThis)

  app = createApp({
    name: 'Issue853App',
    setup: () => () => h(component),
  })
  container = document.createElement('div')
  document.body.append(container)
  app.mount(container)
  await nextTick()

  const apps = await runtime.query({ type: 'apps:snapshot' })
  const appId = apps.apps[0]?.id
  if (!appId) throw new Error('Missing app snapshot')

  const tree = await runtime.query({ appId, type: 'components:treeSnapshot' })
  const node = tree.nodes.find((item) => item.name === name)
  if (!node) throw new Error(`Missing component ${name}`)

  const snapshot = await runtime.query({
    appId,
    payload: { componentId: node.id },
    type: 'components:stateSnapshot',
  })
  if (!snapshot) throw new Error(`Missing state snapshot for ${name}`)
  return snapshot
}

function expectSetupBindings(
  snapshot: ComponentStateSnapshotMessage,
  expected: { count: number; n: number },
): void {
  const entries = snapshot.sections.find((section) => section.id === 'setup')?.entries ?? []
  const count = entries.find((entry) => entry.key === 'count')
  const state = entries.find((entry) => entry.key === 'state')

  expect(count, 'setup.count').toBeDefined()
  expect(state, 'setup.state').toBeDefined()
  expect(readNumericValue(count!.value)).toBe(expected.count)
  expect(readObjectField(state!.value, 'n')).toBe(expected.n)
  expect(count!.meta?.stateType).toBe('ref')
  expect(state!.meta?.stateType).toBe('reactive')
}

function readNumericValue(value: EncodedValue): number | undefined {
  if (value.kind === 'number' && typeof value.value === 'number') return value.value
  if (value.kind === 'object') {
    const nested = readPreview(value.preview, 'value')
    return nested ? readNumericValue(nested) : undefined
  }
  if (value.kind === 'custom') return readNumericValue(value.value)
  return undefined
}

function readObjectField(value: EncodedValue, field: string): number | undefined {
  if (value.kind !== 'object') return undefined
  const nested = readPreview(value.preview, field)
  return nested ? readNumericValue(nested) : undefined
}

function readPreview(
  preview: Array<{ key: string; value: EncodedValue }>,
  field: string,
): EncodedValue | undefined {
  return preview.find((entry) => entry.key === field)?.value
}

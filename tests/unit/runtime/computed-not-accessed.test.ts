// @vitest-environment happy-dom

import { computed, createApp, defineComponent, h, proxyRefs } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComponentStateSnapshotMessage } from '../../../packages/kit/src/protocol'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { NOT_ACCESSED_COMPUTED_DISPLAY, type EncodedValue } from '../../../packages/kit/src/codec'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

let runtime: DevtoolsRuntime | undefined
let app: ReturnType<typeof createApp> | undefined
let container: HTMLDivElement | undefined

describe('unaccessed computed snapshots', () => {
  afterEach(() => {
    app?.unmount()
    app = undefined
    container?.remove()
    container = undefined
    runtime?.dispose()
    runtime = undefined
  })

  it('encodes a setup computed that has never been read as not accessed without running the getter', async () => {
    // https://github.com/vuejs/devtools/issues/535
    let unaccessedRuns = 0
    const unaccessed = computed(() => {
      unaccessedRuns++
      return 'expensive'
    })
    const accessed = computed(() => 'ready')
    const returnsUndefined = computed(() => undefined)
    expect(accessed.value).toBe('ready')
    const raw = { accessed, returnsUndefined, unaccessed }

    const { componentId } = await setupRuntime({
      uid: 1,
      type: { name: 'SetupProbe', __file: '/setup-probe.vue' },
      setupState: proxyRefs(raw),
      devtoolsRawSetupState: raw,
      subTree: { children: [] },
    })

    const before = await queryState(runtime!, componentId)
    expect(unaccessedRuns).toBe(0)
    expect(readEntry(before, 'setup', 'unaccessed')).toMatchObject({
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      kind: 'custom',
    })
    expect(readEntry(before, 'setup', 'accessed')).toEqual({
      kind: 'string',
      value: 'ready',
    })

    expect(unaccessed.value).toBe('expensive')
    expect(returnsUndefined.value).toBeUndefined()
    expect(unaccessedRuns).toBe(1)

    const after = await queryState(runtime!, componentId)
    expect(unaccessedRuns).toBe(1)
    expect(readEntry(after, 'setup', 'unaccessed')).toEqual({
      kind: 'string',
      value: 'expensive',
    })
    expect(readEntry(after, 'setup', 'returnsUndefined')).toEqual({ kind: 'undefined' })
  })

  it('encodes an Options API computed that has never been read as not accessed without running the getter', async () => {
    let hiddenRuns = 0
    const Comp = defineComponent({
      name: 'OptionsProbe',
      computed: {
        shown() {
          return 'visible'
        },
        hidden() {
          hiddenRuns++
          return 'secret'
        },
        missing() {
          return undefined
        },
      },
      render() {
        return h('div', this.shown)
      },
    })

    const componentId = await mountComponent(Comp)
    const before = await queryState(runtime!, componentId)

    expect(hiddenRuns).toBe(0)
    expect(readEntry(before, 'computed', 'hidden')).toMatchObject({
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      kind: 'custom',
    })
    expect(readEntry(before, 'computed', 'shown')).toEqual({
      kind: 'string',
      value: 'visible',
    })
    expect(readEntry(before, 'computed', 'missing')).toMatchObject({
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      kind: 'custom',
    })

    const instance = app!._instance as unknown as { proxy: { hidden: string; missing: undefined } }
    expect(instance.proxy.hidden).toBe('secret')
    expect(instance.proxy.missing).toBeUndefined()
    expect(hiddenRuns).toBe(1)

    const after = await queryState(runtime!, componentId)
    expect(hiddenRuns).toBe(1)
    expect(readEntry(after, 'computed', 'hidden')).toEqual({
      kind: 'string',
      value: 'secret',
    })
    expect(readEntry(after, 'computed', 'missing')).toEqual({ kind: 'undefined' })
  })
})

async function setupRuntime(instance: object): Promise<{ componentId: string }> {
  runtime = createDevtoolsRuntime()
  runtime.dispatch({
    app: { _component: { name: 'Fixture App' }, _instance: instance },
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })
  const snapshot = await runtime.query({
    appId: 'app:0',
    type: 'components:treeSnapshot',
  })
  const componentId = snapshot.nodes[0]?.id
  if (!componentId) throw new Error('Missing component id')
  return { componentId }
}

async function mountComponent(component: ReturnType<typeof defineComponent>): Promise<string> {
  runtime = createDevtoolsRuntime()
  app = createApp(component)
  container = document.createElement('div')
  document.body.append(container)
  app.mount(container)

  const instance = app._instance
  if (!instance) throw new Error('Missing Vue instance')

  runtime.dispatch({
    app: { _component: { name: 'Fixture App' }, _instance: instance },
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })
  const snapshot = await runtime.query({
    appId: 'app:0',
    type: 'components:treeSnapshot',
  })
  const componentId = snapshot.nodes[0]?.id
  if (!componentId) throw new Error('Missing component id')
  return componentId
}

async function queryState(
  activeRuntime: DevtoolsRuntime,
  componentId: string,
): Promise<ComponentStateSnapshotMessage> {
  const state = await activeRuntime.query({
    appId: 'app:0',
    payload: { componentId },
    type: 'components:stateSnapshot',
  })
  if (!state) throw new Error(`Missing state snapshot for ${componentId}`)
  return state
}

function readEntry(
  state: ComponentStateSnapshotMessage,
  sectionId: string,
  key: string,
): EncodedValue | undefined {
  const section = state.sections.find((item) => item.id === sectionId)
  return section?.entries.find((entry) => entry.key === key)?.value
}

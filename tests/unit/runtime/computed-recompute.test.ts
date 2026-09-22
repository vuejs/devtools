// @vitest-environment happy-dom

import type { App } from 'vue'
import type { EncodedValue } from '../../../packages/kit/src/codec'
import type { ComponentStateSnapshotMessage } from '../../../packages/kit/src/protocol'
import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { computed, createApp, defineComponent, h, nextTick, ref, setDevtoolsHook } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

let app: App | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  installed?.dispose()
  runtime?.dispose()
  container?.remove()
  app = undefined
  runtime = undefined
  installed = undefined
  container = undefined
  setDevtoolsHook(undefined!, {})
  vi.unstubAllGlobals()
})

describe('computed recompute', () => {
  it.each([1, undefined])(
    'keeps an unchanged result %s accessed after repeated recomputes',
    async (result) => {
      const getter = vi.fn(() => result)
      const { componentId } = await mountInspectableApp(
        defineComponent({
          setup() {
            return { value: computed(getter) }
          },
          render() {
            return h('div', String(this.value))
          },
        }),
      )
      const initial = await queryState(componentId)
      for (let attempt = 0; attempt < 2; attempt++) {
        const runs = getter.mock.calls.length
        expect(
          await runtime!.command({
            type: 'values:recompute',
            payload: { componentId, path: ['value'], sectionId: 'setup' },
          }),
        ).toEqual({ status: 1 })
        expect(getter.mock.calls.length).toBeGreaterThan(runs)
        expect((await queryState(componentId)).sections).toEqual(initial.sections)
      }
    },
  )

  it('recomputes an exposed computed when setup returns a render function', async () => {
    const box = { n: 1 }
    const { componentId } = await mountInspectableApp(
      defineComponent({
        name: 'ExposedComputedHost',
        setup(_, { expose }) {
          const doubled = computed(() => box.n * 2)
          expose({ doubled })
          return () => h('div', String(doubled.value))
        },
      }),
    )
    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(2)
    box.n = 5
    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(2)
    expect(
      await runtime!.command({
        type: 'values:recompute',
        payload: { componentId, path: ['doubled'], sectionId: 'setup' },
      }),
    ).toEqual({ status: 1 })
    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(10)
  })

  it('triggerRef re-runs a setup computed whose deps did not change', async () => {
    // https://github.com/vuejs/devtools/issues/1041
    const box = { n: 1 }
    const { componentId } = await mountInspectableApp(
      defineComponent({
        name: 'SetupComputedHost',
        setup() {
          const doubled = computed(() => box.n * 2)
          return { doubled, count: ref(0) }
        },
        render() {
          return h('div', String(this.doubled))
        },
      }),
    )

    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(2)

    box.n = 5
    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(2)

    const result = await runtime!.command({
      type: 'values:recompute',
      payload: { componentId, path: ['doubled'], sectionId: 'setup' },
    })
    expect(result).toEqual({ status: 1 })
    expect(await readEncodedNumber(componentId, 'setup', 'doubled')).toBe(10)
  })

  it('triggerRef re-runs a dirty Options API computed', async () => {
    // https://github.com/vuejs/devtools/issues/1041
    const box = { n: 3 }
    const { componentId } = await mountInspectableApp(
      defineComponent({
        name: 'OptionsComputedHost',
        computed: {
          doubled() {
            return box.n * 2
          },
        },
        render() {
          return h('div', String((this as { doubled: number }).doubled))
        },
      }),
    )

    expect(await readEncodedNumber(componentId, 'computed', 'doubled')).toBe(6)

    box.n = 9
    expect(await readEncodedNumber(componentId, 'computed', 'doubled')).toBe(6)

    const result = await runtime!.command({
      type: 'values:recompute',
      payload: { componentId, path: ['doubled'], sectionId: 'computed' },
    })
    expect(result).toEqual({ status: 1 })
    expect(await readEncodedNumber(componentId, 'computed', 'doubled')).toBe(18)
  })

  it('isolates missing, unmounted, and non-computed recompute failures', async () => {
    // https://github.com/vuejs/devtools/issues/1041
    const { componentId } = await mountInspectableApp(
      defineComponent({
        name: 'SetupRefHost',
        setup() {
          return { count: ref(1) }
        },
        render() {
          return h('div', String(this.count))
        },
      }),
    )

    expect(
      await runtime!.command({
        type: 'values:recompute',
        payload: { componentId: 'missing', path: ['count'], sectionId: 'setup' },
      }),
    ).toMatchObject({ status: 0 })
    expect(
      await runtime!.command({
        type: 'values:recompute',
        payload: { componentId, path: ['count'], sectionId: 'setup' },
      }),
    ).toMatchObject({ status: 0 })

    app!.unmount()
    app = undefined
    await nextTick()

    expect(
      await runtime!.command({
        type: 'values:recompute',
        payload: { componentId, path: ['count'], sectionId: 'setup' },
      }),
    ).toMatchObject({ status: 0 })
  })
})

async function mountInspectableApp(component: Parameters<typeof createApp>[0]): Promise<{
  componentId: string
}> {
  runtime = createDevtoolsRuntime()
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  app = createApp(component)
  setDevtoolsHook(installed.hook as unknown as Parameters<typeof setDevtoolsHook>[0], globalThis)
  container = document.createElement('div')
  document.body.append(container)
  app.mount(container)
  await nextTick()

  const snapshot = await runtime.query({
    appId: 'app:0',
    type: 'components:treeSnapshot',
  })
  const componentId = snapshot.nodes[0]?.id
  if (!componentId) throw new Error('Missing inspected component')
  return { componentId }
}

async function readEncodedNumber(
  componentId: string,
  sectionId: string,
  key: string,
): Promise<number | undefined> {
  const state = await queryState(componentId)
  const value = state.sections
    .find((section) => section.id === sectionId)
    ?.entries.find((entry) => entry.key === key)?.value
  return encodedNumber(value)
}

async function queryState(componentId: string): Promise<ComponentStateSnapshotMessage> {
  const state = await runtime!.query({
    appId: 'app:0',
    payload: { componentId },
    type: 'components:stateSnapshot',
  })
  if (!state) throw new Error(`Missing state snapshot for ${componentId}`)
  return state
}

function encodedNumber(value: EncodedValue | undefined): number | undefined {
  return value?.kind === 'number' ? Number(value.value) : undefined
}

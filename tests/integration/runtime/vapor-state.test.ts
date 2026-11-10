// @vitest-environment happy-dom

import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  computed,
  createComponent,
  createVaporApp,
  defineVaporComponent,
  nextTick,
  ref,
  renderEffect,
  setDevtoolsHook,
  setText,
  template,
  toDisplayString,
  txt,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

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

// Same shape as a dev-mode `<script setup vapor>` SFC: `setup` returns the bindings
// and the template is compiled into a separate `render`.
const Counter = defineVaporComponent({
  __name: 'Counter',
  props: { label: { type: String, required: true } },
  emits: ['change'],
  setup(props: { label: string }, { expose, emit }: { expose: () => void; emit: unknown }) {
    expose()
    const count = ref(0)
    const doubled = computed(() => count.value * 2)
    const bindings = { props, emit, count, doubled }
    Object.defineProperty(bindings, '__isScriptSetup', { enumerable: false, value: true })
    return bindings
  },
  render(ctx: { count: number }, $props: { label: string }) {
    const node = template('<b> </b>')() as Node
    const text = txt(node as ParentNode) as Text
    renderEffect(() => setText(text, toDisplayString($props.label) + ctx.count))
    return node
  },
} as never)

async function inspectCounter(rawProps: Record<string, unknown>) {
  runtime = createDevtoolsRuntime()
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  setDevtoolsHook(installed.hook as never, globalThis)
  let instance: Record<string, unknown> | undefined
  app = createVaporApp(
    defineVaporComponent({
      name: 'Root',
      setup: () =>
        (instance = createComponent(Counter, rawProps) as unknown as Record<string, unknown>),
    }),
  )
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  await nextTick()
  const counter = runtime.components.snapshot().nodes.find((node) => node.name === 'Counter')!
  const sections = runtime.componentState.snapshot(counter.id)!.sections
  const section = (id: string) => sections.find((section) => section.id === id)
  return { id: counter.id, instance: instance!, section }
}

describe('Vapor component state', () => {
  it('reads setup state from a dev-mode SFC', async () => {
    const { section } = await inspectCounter({ label: () => 'hi' })
    expect(section('setup')?.entries.map((entry) => entry.key)).toEqual([
      'props',
      'count',
      'doubled',
    ])
  })

  it('shows props as read-only and rejects edits', async () => {
    const { id, section } = await inspectCounter({ label: () => 'hi' })
    expect(section('props')?.entries).toEqual([
      expect.objectContaining({ key: 'label', editable: false }),
    ])
    expect(runtime!.componentState.edit(id, 'props', ['label'], 'changed')).toBe(false)
  })

  it('lists listeners from raw props and dynamic sources', async () => {
    const noop = () => {}
    const { section } = await inspectCounter({
      label: () => 'hi',
      onChange: () => noop,
      onExtra: () => noop,
      $: [{ onSpread: noop }],
    })
    const listeners = section('listeners')?.entries.map((entry) => [
      entry.key,
      (entry.value as { display?: string }).display,
    ])
    expect(listeners).toEqual([
      ['change', 'Declared'],
      ['extra', 'Not declared'],
      ['spread', 'Not declared'],
    ])
  })

  it('lists listeners from a function source without invoking it again', async () => {
    const noop = () => {}
    const source = vi.fn(() => ({ onBound: noop }))
    const { id, section } = await inspectCounter({ label: () => 'hi', $: [source] })
    const calls = source.mock.calls.length
    expect(section('listeners')?.entries.map((entry) => entry.key)).toEqual(['bound'])
    runtime!.componentState.snapshot(id)
    expect(source).toHaveBeenCalledTimes(calls)
  })

  it('does not re-evaluate a dirty cached source before delivery', async () => {
    const { id, instance } = await inspectCounter({ label: () => 'hi' })
    const getter = vi.fn(() => ({ onFresh: () => {} }))
    const dirty = ref(0)
    const source = Object.assign(() => getter(), {
      _cache: computed(() => (dirty.value, getter())),
    })
    void source._cache.value
    dirty.value++
    getter.mockClear()
    instance.rawValues = undefined
    instance.rawProps = { $: [source] }
    expect(() => runtime!.componentState.snapshot(id)).not.toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
})

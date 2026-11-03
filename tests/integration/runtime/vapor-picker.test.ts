// @vitest-environment happy-dom

import type { InstalledDevtoolsHook } from '../../../packages/kit/src/hook/install'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createApp,
  createComponent,
  createIf,
  insert,
  createVaporApp,
  defineComponent,
  defineVaporComponent,
  h,
  nextTick,
  ref,
  setDevtoolsHook,
  template,
  VaporTeleport,
  vaporInteropPlugin,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { installDevtoolsHook } from '../../../packages/kit/src/hook/install'
import {
  cancelComponentInspection,
  inspectComponentInPage,
} from '../../../packages/kit/src/runtime/component-inspector'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

interface MountableApp {
  mount: (el: Element) => unknown
  unmount: () => void
}

let app: MountableApp | undefined
let runtime: DevtoolsRuntime | undefined
let installed: InstalledDevtoolsHook | undefined

afterEach(() => {
  cancelComponentInspection()
  app?.unmount()
  app = undefined
  installed?.dispose()
  runtime?.dispose()
  setDevtoolsHook(undefined!, {})
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function mount(create: () => MountableApp) {
  runtime = createDevtoolsRuntime()
  installed = installDevtoolsHook({ runtime, target: {} })
  vi.stubGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__', installed.hook)
  setDevtoolsHook(installed.hook as never, globalThis)
  app = create()
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  await nextTick()
  await runtime.scheduler.flush()
}

async function pick(target: Element) {
  const inspection = inspectComponentInPage(runtime!)
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  const result = await inspection
  return result && runtime!.registry.getComponent(result.componentId, result.appId)?.name
}

const query = (selector: string) => document.querySelector(selector)!

describe('Vapor element picker', () => {
  it('selects the innermost Vapor component, including nested elements', async () => {
    const Child = defineVaporComponent({
      name: 'Child',
      setup: () => template('<div class="child"><b>deep</b></div>')(),
    })
    await mount(() =>
      createVaporApp(
        defineVaporComponent({
          name: 'Root',
          setup: () => [template('<p>root</p>')(), createComponent(Child)],
        }),
      ),
    )

    expect(await pick(query('.child b'))).toBe('Child')
    expect(await pick(query('p'))).toBe('Root')
  })

  it('selects a child inserted into a template element', async () => {
    // Compiled `<div><Child /></div>`: the root block is the `<div>`, so the child
    // instance is not reachable from it and is only known through `component:added`.
    const Child = defineVaporComponent({
      name: 'Child',
      setup: () => template('<b class="child">child</b>')(),
    })
    await mount(() =>
      createVaporApp(
        defineVaporComponent({
          name: 'Root',
          setup: () => {
            const div = template('<div class="root"></div>')() as Element
            insert(createComponent(Child) as never, div)
            return div
          },
        }),
      ),
    )

    expect(await pick(query('.child'))).toBe('Child')
    expect(await pick(query('.root'))).toBe('Root')
  })

  it('finds nodes a v-if renders after the picker starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const show = ref(false)
    await mount(() =>
      createVaporApp(
        defineVaporComponent({
          name: 'Root',
          setup: () => [
            template('<p>root</p>')(),
            createIf(
              () => show.value,
              () => template('<i>late</i>')(),
            ),
          ],
        }),
      ),
    )
    const inspection = inspectComponentInPage(runtime!)
    query('p').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    show.value = true
    await nextTick()
    vi.advanceTimersByTime(1000)
    query('i').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const result = await inspection
    expect(runtime!.registry.getComponent(result!.componentId)?.name).toBe('Root')
  })

  it('maps teleported content to its owner', async () => {
    const target = document.createElement('section')
    document.body.append(target)
    await mount(() =>
      createVaporApp(
        defineVaporComponent({
          name: 'Root',
          setup: () =>
            createComponent(
              VaporTeleport,
              { to: () => target },
              { default: () => template('<span>moved</span>')() },
            ),
        }),
      ),
    )

    expect(await pick(query('section span'))).toBe('Root')
  })

  it('crosses the VDOM / Vapor boundary in both directions', async () => {
    const VdomLeaf = defineComponent({ name: 'VdomLeaf', render: () => h('em', 'vdom') })
    const VaporMiddle = defineVaporComponent({
      name: 'VaporMiddle',
      setup: () => [template('<u>vapor</u>')(), createComponent(VdomLeaf as never)],
    })
    await mount(() => {
      const vdom = createApp(
        defineComponent({ name: 'Root', render: () => h('main', [h(VaporMiddle)]) }),
      )
      vdom.use(vaporInteropPlugin)
      return vdom
    })

    expect(await pick(query('u'))).toBe('VaporMiddle')
    expect(await pick(query('em'))).toBe('VdomLeaf')
    expect(await pick(query('main'))).toBe('Root')
  })
})

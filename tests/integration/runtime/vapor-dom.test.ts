// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createApp,
  createComponent,
  createIf,
  createVaporApp,
  defineComponent,
  defineVaporComponent,
  h,
  nextTick,
  ref,
  template,
  VaporTeleport,
  vaporInteropPlugin,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { getRootNodesFromInstance } from '../../../packages/kit/src/runtime/component-inspector'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

function mount(app: { mount: (el: Element) => unknown; unmount: () => void; _instance?: unknown }) {
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  cleanups.push(() => app.unmount())
  return app._instance as object
}

const outerHTML = (nodes: Node[]) =>
  nodes.map((node) => (node as Element).outerHTML ?? node.textContent)

describe('Vapor root nodes', () => {
  it('collects elements across arrays, v-if and nested components, skipping anchors', async () => {
    const show = ref(true)
    const Child = defineVaporComponent({ setup: () => template('<b>child</b>')() })
    const root = mount(
      createVaporApp(
        defineVaporComponent({
          setup: () => [
            template('<p>first</p>')(),
            createIf(
              () => show.value,
              () => template('<i>maybe</i>')(),
            ),
            createComponent(Child),
          ],
        }),
      ),
    )
    expect(outerHTML(getRootNodesFromInstance(root))).toEqual([
      '<p>first</p>',
      '<i>maybe</i>',
      '<b>child</b>',
    ])

    show.value = false
    await nextTick()
    expect(outerHTML(getRootNodesFromInstance(root))).toEqual(['<p>first</p>', '<b>child</b>'])
  })

  it('uses the teleport target content', () => {
    const target = document.createElement('section')
    document.body.append(target)
    const root = mount(
      createVaporApp(
        defineVaporComponent({
          setup: () =>
            createComponent(
              VaporTeleport,
              { to: () => target },
              { default: () => template('<span>moved</span>')() },
            ),
        }),
      ),
    )
    const nodes = getRootNodesFromInstance(root)
    expect(outerHTML(nodes)).toEqual(['<span>moved</span>'])
    expect(nodes[0]!.parentNode).toBe(target)
  })

  it('crosses the VDOM / Vapor boundary in both directions', () => {
    const VdomLeaf = defineComponent({ render: () => h('em', 'vdom') })
    const VaporMiddle = defineVaporComponent({
      setup: () => [template('<u>vapor</u>')(), createComponent(VdomLeaf as never)],
    })
    const app = createApp(defineComponent({ render: () => h(VaporMiddle) }))
    app.use(vaporInteropPlugin)
    const root = mount(app)
    expect(outerHTML(getRootNodesFromInstance(root))).toEqual(['<u>vapor</u>', '<em>vdom</em>'])
  })
})

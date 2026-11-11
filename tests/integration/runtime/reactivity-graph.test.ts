// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createApp,
  createComponent,
  createVaporApp,
  defineComponent,
  defineVaporComponent,
  h,
  ref,
  renderEffect,
  setText,
  template,
  txt,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { buildComponentReactivityGraph } from '../../../packages/kit/src/runtime/state/reactivity-graph'

let app: ReturnType<typeof createApp> | ReturnType<typeof createVaporApp> | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

describe('component reactivity graph', () => {
  it.each(['Vapor', 'VDOM'])('attributes %s render effects to their owning component', (mode) => {
    const count = ref(0)
    if (mode === 'Vapor') {
      const Child = defineVaporComponent({
        name: 'Child',
        setup() {
          const node = template('<b> </b>')()
          const text = txt(node as ParentNode) as Text
          renderEffect(() => setText(text, String(count.value)))
          return node
        },
      })
      app = createVaporApp(
        defineVaporComponent({
          name: 'Parent',
          setup: () => ({ count }),
          render: () => createComponent(Child),
        } as never),
      )
    } else {
      const Child = defineComponent({ name: 'Child', setup: () => () => h('b', count.value) })
      app = createApp(
        defineComponent({
          name: 'Parent',
          setup: () => ({ count }),
          render: () => h(Child),
        }),
      )
    }

    const container = document.createElement('div')
    document.body.append(container)
    app.mount(container)
    let nextId = 0
    const graph = buildComponentReactivityGraph(app._instance!, () => String(++nextId))
    const source = graph.nodes.find((node) => node.label === 'count')!
    const render = graph.nodes.find((node) => node.type === 'render')!

    expect(source).toMatchObject({ type: 'ref', label: 'count' })
    expect(render).toMatchObject({ label: 'Child render', data: { instanceName: 'Child' } })
    expect(graph.relationships).toContainEqual({
      id: `${source.id}->${render.id}`,
      from: source.id,
      to: render.id,
    })
  })
})

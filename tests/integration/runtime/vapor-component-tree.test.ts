// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createApp,
  createComponent,
  createFor,
  createIf,
  createVaporApp,
  defineComponent,
  defineVaporComponent,
  h,
  nextTick,
  ref,
  template,
  VaporKeepAlive,
  VaporTeleport,
  vaporInteropPlugin,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { RuntimeRegistry } from '../../../packages/kit/src/runtime/registry'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

function mount(app: { mount: (el: Element) => unknown; unmount: () => void }) {
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  cleanups.push(() => app.unmount())
  return app
}

function snapshot(app: object) {
  const registry = new RuntimeRegistry()
  const record = registry.addApp(app, '3.6.0', {}, 1)
  registry.refreshComponentTree(record.id)
  const byId = new Map([...record.components.values()].map((c) => [c.id, c]))
  const tree = (id: string): unknown => {
    const node = byId.get(id)!
    const children = [...byId.values()].filter((c) => c.parentId === id)
    return {
      name: node.name,
      ...(node.isFragment ? { fragment: true } : {}),
      ...(node.renderKey !== undefined ? { key: node.renderKey } : {}),
      ...(node.inactive ? { inactive: true } : {}),
      ...(node.tags?.length ? { tags: node.tags.map((tag) => tag.label) } : {}),
      ...(children.length ? { children: children.map((c) => tree(c.id)) } : {}),
    }
  }
  const root = [...byId.values()].find((c) => !c.parentId)!
  return { registry, record, tree: tree(root.id) }
}

const Leaf = defineVaporComponent({
  name: 'Leaf',
  setup: () => template('<span>leaf</span>')(),
})

describe('Vapor component tree', () => {
  it('walks arrays, v-if, v-for, teleport and KeepAlive blocks', async () => {
    const show = ref(true)
    const items = ref([1, 2])
    const target = document.createElement('div')
    document.body.append(target)
    const Item = defineVaporComponent({ name: 'Item', setup: () => template('<i></i>')() })
    const Tab = defineVaporComponent({ name: 'Tab', setup: () => template('<b></b>')() })
    const Other = defineVaporComponent({ name: 'Other', setup: () => template('<u></u>')() })
    const tab = ref<object>(Tab)

    const Root = defineVaporComponent({
      name: 'Root',
      setup: () => [
        createComponent(Leaf),
        createIf(
          () => show.value,
          () => createComponent(Leaf),
        ),
        createFor(
          () => items.value,
          () => createComponent(Item),
          (item: number) => item,
        ),
        createComponent(
          VaporTeleport,
          { to: () => target },
          { default: () => createComponent(Leaf) },
        ),
        createComponent(VaporKeepAlive, null, {
          default: () =>
            createIf(
              () => tab.value === Tab,
              () => createComponent(Tab),
              () => createComponent(Other),
            ),
        }),
      ],
    })

    const app = mount(createVaporApp(Root))
    tab.value = Other
    await nextTick()

    const { tree } = snapshot(app)
    expect(tree).toMatchObject({
      name: 'Root',
      fragment: true,
      children: [
        { name: 'Leaf' },
        { name: 'Leaf' },
        { name: 'Item', key: 1 },
        { name: 'Item', key: 2 },
        // Teleport is a fragment, not an instance: its content is tagged instead.
        { name: 'Leaf', tags: ['teleport'] },
        { name: 'VaporKeepAlive', children: [{ name: 'Other' }] },
      ],
    })
  })

  it('walks VDOM children of Vapor parents and Vapor children of VDOM parents', () => {
    const VdomChild = defineComponent({
      name: 'VdomChild',
      render: () => h(Leaf),
    })
    const VaporMiddle = defineVaporComponent({
      name: 'VaporMiddle',
      setup: () => createComponent(VdomChild as never),
    })
    const Root = defineComponent({ name: 'Root', render: () => h('div', [h(VaporMiddle)]) })

    const app = createApp(Root)
    app.use(vaporInteropPlugin)
    mount(app)

    expect(snapshot(app).tree).toEqual({
      name: 'Root',
      children: [
        {
          name: 'VaporMiddle',
          children: [{ name: 'VdomChild', children: [{ name: 'Leaf' }] }],
        },
      ],
    })
  })

  it('reports Vapor child counts', () => {
    const Root = defineVaporComponent({
      name: 'Root',
      setup: () => [createComponent(Leaf), template('<p></p>')(), createComponent(Leaf)],
    })
    const app = mount(createVaporApp(Root))
    const { registry, record } = snapshot(app)
    const root = [...record.components.values()].find((c) => !c.parentId)!
    expect(registry.getComponentChildCount(root)).toBe(2)
  })

  it('lists Vapor KeepAlive cache entries, including interop fragments', () => {
    const vdomCached = { uid: 30, type: { name: 'VdomCached' }, subTree: { type: 'div' } }
    const keepAlive: Record<string, unknown> = {
      uid: 2,
      vapor: true,
      type: { name: 'VaporKeepAlive', __isKeepAlive: true },
      block: [],
    }
    const active = { uid: 3, vapor: true, type: { name: 'Active' }, parent: keepAlive, block: [] }
    const cached = { uid: 4, vapor: true, type: { name: 'Cached' }, parent: keepAlive, block: [] }
    Object.assign(vdomCached, { parent: keepAlive })
    keepAlive.block = active
    keepAlive.__v_cache = new Map<unknown, unknown>([
      ['a', active],
      ['b', cached],
      ['c', { __vf: 64 | 1, nodes: [], vnode: { component: vdomCached } }],
    ])
    const root = { uid: 1, vapor: true, type: { name: 'Root' }, block: keepAlive }
    keepAlive.parent = root

    expect(snapshot({ vapor: true, _instance: root }).tree).toEqual({
      name: 'Root',
      children: [
        {
          name: 'VaporKeepAlive',
          children: [
            { name: 'Active' },
            { name: 'Cached', inactive: true },
            { name: 'VdomCached', inactive: true },
          ],
        },
      ],
    })
  })
})

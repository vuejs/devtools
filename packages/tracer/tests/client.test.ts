// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cloneVNode, createVNode, Fragment } from 'vue'
import {
  findElementPosition,
  findTraceFromElement,
  getElementPosition,
  recordPosition,
} from '../src/client'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('exposes a non-enumerable position bridge without exposing the store', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__VUE_DEVTOOLS_TRACER__')!
  const bridge = descriptor.value as {
    getElementPosition: (el: Element) => [string, number, number] | undefined
  }
  expect(descriptor.enumerable).toBe(false)
  expect(Object.keys(bridge)).toEqual(['getElementPosition'])

  const vnode = createVNode('div')
  expect(recordPosition('src/App.vue', 5, 0, vnode)).toBe(vnode)
  const el = document.createElement('div')
  Object.defineProperty(el, '__vnode', { value: vnode })
  expect(bridge.getElementPosition(el)).toEqual(['src/App.vue', 5, 0])
  expect(bridge.getElementPosition(document.createElement('span'))).toBeUndefined()
})

it('returns the nearest recorded ancestor for an unrecorded child', () => {
  const bridge = Object.getOwnPropertyDescriptor(globalThis, '__VUE_DEVTOOLS_TRACER__')!.value as {
    getElementPosition: (el: Element) => [string, number, number] | undefined
  }
  const outer = document.createElement('section')
  const parent = document.createElement('div')
  const child = document.createElement('span')
  outer.appendChild(parent)
  parent.appendChild(child)

  Object.defineProperty(outer, '__vnode', {
    value: recordPosition('src/App.vue', 2, 0, createVNode('section')),
  })
  Object.defineProperty(parent, '__vnode', {
    value: recordPosition('src/App.vue', 5, 2, createVNode('div')),
  })
  expect(bridge.getElementPosition(child)).toEqual(['src/App.vue', 5, 2])

  Object.defineProperty(child, '__vnode', {
    value: recordPosition('src/App.vue', 6, 4, createVNode('span')),
  })
  expect(bridge.getElementPosition(child)).toEqual(['src/App.vue', 6, 4])
})

it('reads a DOM source with colons in the path and preserves column zero in fullpath', () => {
  const el = document.createElement('button')
  el.setAttribute('data-v-source', 'packages/demo:preview/App.vue:12:0')
  const trace = findTraceFromElement(el)!
  expect(trace.pos).toEqual(['packages/demo:preview/App.vue', 12, 0])
  expect(trace.fullpath).toBe('packages/demo:preview/App.vue:12:0')
  expect(trace.el).toBe(el)
  expect(trace.vnode).toBeUndefined()
  el.setAttribute('data-v-source', 'packages/demo:preview/App.vue:18:4')
  expect(getElementPosition(el)).toEqual(['packages/demo:preview/App.vue', 18, 4])
})

it('prefers a recorded VNode and falls back when the VNode has no record', () => {
  const el = document.createElement('button')
  el.setAttribute('data-v-source', 'Vapor.vue:2:0')
  const vnode = createVNode('button')
  Object.assign(el, { __vnode: vnode })
  expect(findTraceFromElement(el)?.pos).toEqual(['Vapor.vue', 2, 0])
  recordPosition('VNode.vue', 3, 0, vnode)
  expect(findTraceFromElement(el)?.pos).toEqual(['VNode.vue', 3, 0])
  expect(findTraceFromElement(el)?.fullpath).toBe('VNode.vue:3:0')
  expect(findTraceFromElement(el)?.vnode).toBe(vnode)
})

it.each([
  '',
  ':1:0',
  '   :1:0',
  'App.vue',
  'App.vue:1',
  'App.vue:0:0',
  'App.vue:-1:0',
  'App.vue:1:-1',
  'App.vue:1.5:0',
  'App.vue:1:0.5',
  'App.vue:NaN:0',
  'App.vue:1:Infinity',
  'App.vue:9007199254740992:0',
  'App.vue:1:9007199254740992',
])('ignores invalid source %j and keeps ancestor fallback', (value) => {
  const parent = document.createElement('section')
  const child = document.createElement('span')
  parent.setAttribute('data-v-source', 'Parent.vue:1:0')
  child.setAttribute('data-v-source', value)
  parent.append(child)
  expect(findTraceFromElement(child)).toBeUndefined()
  expect(getElementPosition(child)).toEqual(['Parent.vue', 1, 0])
})

it('merges DOM and VNode matches once per element, with no VNode index required', () => {
  const root = document.createElement('section')
  const peer = document.createElement('section')
  const otherLine = document.createElement('p')
  const otherFile = document.createElement('aside')
  const vnodeOnly = document.createElement('section')
  root.setAttribute('data-v-source', 'Mixed.vue:5:0')
  peer.setAttribute('data-v-source', 'Mixed.vue:5:0')
  otherLine.setAttribute('data-v-source', 'Mixed.vue:6:0')
  otherFile.setAttribute('data-v-source', 'Other.vue:5:0')
  document.body.append(root, peer, otherLine, otherFile, vnodeOnly)
  const trace = findTraceFromElement(root)!
  expect(trace.getElementsSameFile()).toEqual([peer, otherLine])
  expect(trace.getElementsSamePosition()).toEqual([peer])

  Object.assign(peer, { __vnode: recordPosition('Mixed.vue', 5, 0, createVNode('section')) })
  Object.assign(vnodeOnly, { __vnode: recordPosition('Mixed.vue', 5, 0, createVNode('section')) })
  expect(trace.getElementsSameFile()).toEqual([peer, otherLine, vnodeOnly])
  expect(trace.getElementsSamePosition()).toEqual([peer, vnodeOnly])
  expect(findTraceFromElement(vnodeOnly)?.getElementsSamePosition()).toEqual([root, peer])

  // The effective VNode record takes precedence over a conflicting DOM attribute.
  recordPosition(
    'Other.vue',
    5,
    0,
    (peer as unknown as { __vnode: ReturnType<typeof createVNode> }).__vnode,
  )
  expect(trace.getElementsSamePosition()).toEqual([vnodeOnly])
})

it('finds a DOM-recorded parent and reads decoded HTML attribute paths', () => {
  const parent = document.createElement('section')
  parent.innerHTML = '<button data-v-source="src/A&amp;B&quot;.vue:2:0"></button>'
  parent.setAttribute('data-v-source', 'Parent.vue:1:0')
  const trace = findTraceFromElement(parent.firstElementChild)!
  expect(trace.filepath).toBe('src/A&B".vue')
  expect(trace.getParent()?.pos).toEqual(['Parent.vue', 1, 0])
})

it('detects valid DOM data without VNode records and notices removals', async () => {
  vi.stubGlobal('__vue_tracer__', undefined)
  vi.stubGlobal('__VUE_DEVTOOLS_TRACER__', Reflect.get(globalThis, '__VUE_DEVTOOLS_TRACER__'))
  vi.resetModules()
  const client = await import('../src/client')
  expect(client.hasData()).toBe(false)
  const el = document.createElement('div')
  el.setAttribute('data-v-source', 'invalid')
  document.body.append(el)
  expect(client.hasData()).toBe(false)
  el.setAttribute('data-v-source', 'Vapor.vue:1:0')
  expect(client.hasData()).toBe(true)
  el.remove()
  expect(client.hasData()).toBe(false)
  client.recordPosition('VNode.vue', 1, 0, createVNode('div'))
  expect(client.hasData()).toBe(true)
})

it('limits pure DOM file queries and same-position queries to matching candidates', () => {
  const source = 'src/Scoped:preview.vue'
  const root = document.createElement('section')
  const peer = document.createElement('section')
  const otherTag = document.createElement('div')
  for (const el of [root, peer, otherTag]) {
    el.setAttribute('data-v-source', `${source}:5:0`)
    document.body.append(el)
  }
  const query = vi.spyOn(document, 'querySelectorAll')
  const trace = findTraceFromElement(root)!
  expect(trace.getElementsSamePosition()).toEqual([peer])
  expect(query).toHaveBeenCalledExactlyOnceWith('section[data-v-source]')
  query.mockClear()
  expect(trace.getElementsSameFile()).toEqual([peer, otherTag])
  expect(query).toHaveBeenCalledExactlyOnceWith(`[data-v-source^="${CSS.escape(`${source}:`)}"]`)
  query.mockRestore()
})

it.each(['attribute', 'vnode'] as const)('finds a %s source on an open shadow host', (source) => {
  const host = document.createElement('div')
  const child = document.createElement('button')
  host.attachShadow({ mode: 'open' }).append(child)
  if (source === 'attribute') host.setAttribute('data-v-source', 'Host.vue:3:0')
  else Object.assign(host, { __vnode: recordPosition('Host.vue', 3, 0, createVNode('div')) })
  expect(findElementPosition(child)).toEqual({ el: host, pos: ['Host.vue', 3, 0] })
})

it('crosses nested shadow hosts and prefers the nearest internal source', () => {
  const outer = document.createElement('div')
  const inner = document.createElement('section')
  const wrapper = document.createElement('article')
  const child = document.createElement('button')
  outer.attachShadow({ mode: 'open' }).append(inner)
  inner.attachShadow({ mode: 'open' }).append(wrapper)
  wrapper.append(child)
  outer.setAttribute('data-v-source', 'Outer.vue:1:0')
  expect(getElementPosition(child)).toEqual(['Outer.vue', 1, 0])
  Object.assign(inner, { __vnode: recordPosition('Inner.vue', 2, 0, createVNode('section')) })
  expect(getElementPosition(child)).toEqual(['Inner.vue', 2, 0])
  wrapper.setAttribute('data-v-source', 'Internal.vue:4:0')
  expect(findElementPosition(child)).toEqual({ el: wrapper, pos: ['Internal.vue', 4, 0] })
  Object.assign(child, { __vnode: recordPosition('Child.vue', 5, 0, createVNode('button')) })
  expect(getElementPosition(child)).toEqual(['Child.vue', 5, 0])
})

it('uses the composed path for shadow pointer events before a host-only pointer hit', async () => {
  const { events, isEnabled } = await import('../src/listeners')
  const host = document.createElement('div')
  const child = document.createElement('button')
  host.setAttribute('data-v-source', 'Host.vue:1:0')
  host.attachShadow({ mode: 'open' }).append(child)
  document.body.append(host)
  const descriptor = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint')
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [host] })
  const click = vi.fn()
  const off = events.on('click', click)
  isEnabled.value = true
  try {
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(click.mock.calls[0]?.[0].pos).toEqual(['Host.vue', 1, 0])
    child.setAttribute('data-v-source', 'Child.vue:5:0')
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(click.mock.calls[1]?.[0].pos).toEqual(['Child.vue', 5, 0])
  } finally {
    off()
    isEnabled.value = false
    if (descriptor) Object.defineProperty(document, 'elementsFromPoint', descriptor)
    else Reflect.deleteProperty(document, 'elementsFromPoint')
  }
})

it('narrows VNode file scans while retaining cloned instances, document order and removals', () => {
  const source = 'Narrowed.vue'
  const vnode = recordPosition(source, 1, 0, createVNode('section'))
  const nodes = Array.from({ length: 3 }, () => {
    const el = document.createElement('section')
    Object.assign(el, { __vnode: cloneVNode(vnode) })
    document.body.append(el)
    return el
  })
  // The original VNode never mounts; its clones share the recorded props.
  expect(vnode.el).toBeNull()
  const other = document.createElement('span')
  Object.assign(other, { __vnode: recordPosition(source, 2, 0, createVNode('span')) })
  document.body.append(other)
  const query = vi.spyOn(document, 'querySelectorAll')
  const trace = findTraceFromElement(nodes[0])!
  expect(trace.getElementsSameFile()).toEqual([nodes[1], nodes[2], other])
  expect(query.mock.calls.map(([selector]) => selector)).toEqual([
    `[data-v-source^="${CSS.escape(`${source}:`)}"]`,
    'section,span',
  ])
  expect(trace.getElementsSamePosition()).toEqual([nodes[1], nodes[2]])
  nodes[1]!.remove()
  document.body.prepend(nodes[2]!)
  expect(trace.getElementsSameFile()).toEqual([nodes[2], other])
  expect(trace.getElementsSamePosition()).toEqual([nodes[2]])
})

it('shares tag metadata across client module copies', async () => {
  const source = 'Copies.vue'
  const first = document.createElement('div')
  Object.assign(first, { __vnode: recordPosition(source, 1, 0, createVNode('div')) })
  vi.resetModules()
  const other = await import('../src/client')
  const second = document.createElement('p')
  Object.assign(second, { __vnode: other.recordPosition(source, 2, 0, createVNode('p')) })
  document.body.append(first, second)
  expect(findTraceFromElement(first)!.getElementsSameFile()).toEqual([second])
  expect(other.findTraceFromElement(second)!.getElementsSameFile()).toEqual([first])
})

it('uses native VNodes on mounted component, reused, Fragment and Teleport roots', async () => {
  const { createApp, h, ref, nextTick, Teleport } = await import('vue')
  const host = document.createElement('div')
  const target = document.createElement('aside')
  document.body.append(host, target)
  const changed = ref(false)
  const Child = {
    render: () => recordPosition('Roots.vue', 2, 0, h('section', changed.value ? 'new' : 'old')),
  }
  const Reused = { render: () => recordPosition('Roots.vue', 3, 0, h(Child)) }
  const app = createApp({
    render: () =>
      h(Fragment, [
        recordPosition('Roots.vue', 1, 0, h(Reused)),
        recordPosition(
          'Roots.vue',
          4,
          0,
          h(Fragment, [
            recordPosition('Roots.vue', 5, 0, h('p')),
            recordPosition('Roots.vue', 6, 0, h('span')),
          ]),
        ),
        recordPosition(
          'Roots.vue',
          7,
          0,
          h(Teleport, { to: target }, [recordPosition('Roots.vue', 8, 0, h('button'))]),
        ),
      ]),
  })
  app.mount(host)
  try {
    for (const el of [...host.querySelectorAll('*'), ...target.querySelectorAll('*')])
      expect((el as Element & { __vnode: ReturnType<typeof createVNode> }).__vnode.type).toBe(
        el.localName,
      )
    changed.value = true
    await nextTick()
    const root = host.querySelector('section')!
    expect(
      (root as unknown as Element & { __vnode: ReturnType<typeof createVNode> }).__vnode.type,
    ).toBe('section')
    const query = vi.spyOn(document, 'querySelectorAll')
    expect(findTraceFromElement(root)!.getElementsSameFile()).toEqual([
      host.querySelector('p'),
      host.querySelector('span'),
      target.querySelector('button'),
    ])
    expect(query).not.toHaveBeenCalledWith('*')
  } finally {
    app.unmount()
  }
})

it('retains a component VNode on an async hydration root before resolution', async () => {
  const { createSSRApp, defineAsyncComponent, h } = await import('vue')
  const host = document.createElement('div')
  host.innerHTML = '<section>async</section>'
  document.body.append(host)
  const Async = defineAsyncComponent(() => new Promise(() => {}))
  const vnode = recordPosition('Async.vue', 1, 0, h(Async))
  const app = createSSRApp({ render: () => vnode })
  app.mount(host)
  try {
    expect(
      (host.firstElementChild as Element & { __vnode: ReturnType<typeof createVNode> }).__vnode
        .type,
    ).toBe(Async)
  } finally {
    app.unmount()
  }
})

it('retains static and pending async-setup VNodes on hydrated elements', async () => {
  const { createSSRApp, createStaticVNode, h, Suspense } = await import('vue')
  for (const kind of ['static', 'async-setup'] as const) {
    const host = document.createElement('div')
    host.innerHTML = '<section>hydrated</section>'
    document.body.append(host)
    const component = {
      async setup() {
        await new Promise(() => {})
        return () => h('section')
      },
    }
    const vnode = recordPosition(
      `${kind}.vue`,
      1,
      0,
      kind === 'static' ? createStaticVNode('<section>hydrated</section>', 1) : h(component),
    )
    const app = createSSRApp({
      render: () => (kind === 'static' ? vnode : h(Suspense, null, { default: () => vnode })),
    })
    app.mount(host)
    try {
      expect(
        (host.firstElementChild as Element & { __vnode: ReturnType<typeof createVNode> }).__vnode
          .type,
      ).toBe(vnode.type)
    } finally {
      app.unmount()
      host.remove()
    }
  }
})

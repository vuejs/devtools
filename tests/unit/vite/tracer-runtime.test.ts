// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createVNode } from 'vue'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { cancelComponentInspection } from '../../../packages/kit/src/runtime/component-inspector'

it('discovers a late tracer and preserves its records when the module is reloaded', async () => {
  const runtime = createDevtoolsRuntime()
  const element = document.createElement('button')
  const instance = { uid: 0, type: { name: 'App' }, subTree: { el: element } }
  Object.assign(element, { __vueParentComponent: instance })
  document.body.append(element)
  runtime.dispatch({
    app: { _component: { name: 'App' }, _instance: instance },
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })
  const inspect = async () => {
    const result = runtime.query({ type: 'components:inspect' })
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return result
  }
  try {
    expect(Object.hasOwn(globalThis, '__VUE_DEVTOOLS_TRACER__')).toBe(false)
    const first = await inspect()
    expect(first).toMatchObject({ appId: 'app:0', componentId: expect.any(String) })
    expect(first).not.toHaveProperty('source')

    const tracer = await import('../../../packages/tracer/src/client')
    const vnode = tracer.recordPosition('App.vue', 8, 2, createVNode('button'))
    Object.assign(element, { __vnode: vnode })
    await expect(inspect()).resolves.toMatchObject({
      source: { file: 'App.vue', line: 8, column: 2 },
    })

    // Re-evaluation models a hot replacement or a separately loaded runtime copy.
    vi.resetModules()
    const reloaded = await import('../../../packages/tracer/src/client')
    expect(reloaded.getInternalStore()).toBe(tracer.getInternalStore())
    expect(reloaded.findTraceFromVNode(vnode)?.pos).toEqual(['App.vue', 8, 2])
    await expect(inspect()).resolves.toMatchObject({
      source: { file: 'App.vue', line: 8, column: 2 },
    })
    reloaded.recordPosition('App.vue', 10, 4, vnode)
    expect(tracer.getElementPosition(element)).toEqual(['App.vue', 10, 4])
    await expect(inspect()).resolves.toMatchObject({
      source: { file: 'App.vue', line: 10, column: 4 },
    })
  } finally {
    cancelComponentInspection()
    runtime.dispose()
    element.remove()
  }
})

it('returns DOM attribute sources through kit inspection without a VNode record', async () => {
  await import('../../../packages/tracer/src/client')
  const runtime = createDevtoolsRuntime()
  const parent = document.createElement('section')
  const element = document.createElement('button')
  const instance = { uid: 0, type: { name: 'VaporApp' }, subTree: { el: parent } }
  Object.assign(parent, { __vueParentComponent: instance })
  parent.append(element)
  document.body.append(parent)
  parent.setAttribute('data-v-source', 'src/Parent.vue:2:0')
  element.setAttribute('data-v-source', 'src/Vapor:App.vue:8:0')
  runtime.dispatch({
    app: { _component: { name: 'VaporApp' }, _instance: instance },
    time: 1,
    type: 'app:init',
    version: '3.6.0',
    vueTypes: {},
  })
  const inspect = () => {
    const result = runtime.query({ type: 'components:inspect' })
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return result
  }
  try {
    await expect(inspect()).resolves.toMatchObject({
      appId: 'app:0',
      componentId: expect.any(String),
      source: { file: 'src/Vapor:App.vue', line: 8, column: 0 },
    })
    element.setAttribute('data-v-source', 'src/Vapor:App.vue:10:4')
    await expect(inspect()).resolves.toMatchObject({
      source: { file: 'src/Vapor:App.vue', line: 10, column: 4 },
    })
    element.setAttribute('data-v-source', 'invalid')
    await expect(inspect()).resolves.toMatchObject({
      source: { file: 'src/Parent.vue', line: 2, column: 0 },
    })
    parent.removeAttribute('data-v-source')
    const result = await inspect()
    expect(result).toMatchObject({ appId: 'app:0', componentId: expect.any(String) })
    expect(result).not.toHaveProperty('source')
  } finally {
    cancelComponentInspection()
    runtime.dispose()
    parent.remove()
  }
})

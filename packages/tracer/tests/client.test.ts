// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { createVNode } from 'vue'
import { recordPosition } from '../src/client'

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

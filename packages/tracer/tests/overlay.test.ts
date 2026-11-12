// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createVNode } from 'vue'
import { events, isEnabled, recordPosition, state } from '../src/overlay'

const cleanups: (() => void)[] = []
afterEach(() => {
  isEnabled.value = false
  state.isVisible = false
  state.isFocused = false
  state.isAnimated = true
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

function setup() {
  const parent = document.createElement('section')
  const child = document.createElement('span')
  parent.append(child)
  document.body.append(parent)
  Object.defineProperty(parent, '__vnode', {
    value: recordPosition('src/App.vue', 7, 0, createVNode('section')),
  })
  const parentRect = vi
    .spyOn(parent, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(10, 20, 100, 50))
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [child, parent],
  })
  return { parent, child, parentRect }
}

it('shares enabled state and draws the source tag, rectangle and upstream zero-based column', () => {
  const { child } = setup()
  state.isEnabled = true
  expect(isEnabled.value).toBe(true)
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  const node = document.querySelector('#vue-tracer-overlay')!
  expect(node.textContent).toBe('<section> src/App.vue:7:0')
  const rect = node.querySelector('rect')!
  expect(['x', 'y', 'width', 'height'].map((key) => rect.getAttribute(key))).toEqual([
    '10',
    '20',
    '100',
    '50',
  ])
  state.isEnabled = false
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
})

it('renders matching source instances and responds to focus, animation and scroll', () => {
  const { child, parentRect } = setup()
  const sibling = document.createElement('section')
  Object.defineProperty(sibling, '__vnode', {
    value: recordPosition('src/App.vue', 7, 0, createVNode('section')),
  })
  document.body.append(sibling)
  vi.spyOn(sibling, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 20, 100, 50))
  isEnabled.value = true
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  expect(state.sub.rects).toHaveLength(1)
  const node = document.querySelector('#vue-tracer-overlay')!
  expect(node.querySelector('[data-tracer-sub]')?.getAttribute('x')).toBe('120')
  state.isFocused = true
  state.isAnimated = false
  const rect = node.querySelector('rect')!
  expect(rect.getAttribute('x')).toBe('0')
  expect(rect.getAttribute('fill')).toBe('transparent')
  expect(rect.style.transition).toBe('none')
  expect(node.querySelector('div')?.hidden).toBe(true)
  parentRect.mockReturnValue(new DOMRect(20, 30, 100, 50))
  document.dispatchEvent(new Event('scroll'))
  expect(state.mainRect?.left).toBe(20)
  expect(node.querySelectorAll('[data-tracer-sub]')).toHaveLength(1)
  sibling.remove()
  document.dispatchEvent(new Event('scroll'))
  expect(node.querySelectorAll('[data-tracer-sub]')).toHaveLength(0)
})

it.each(['devframes-dock-embedded', 'data-v-inspector-ignore'])(
  'passes through %s interactions across a shadow boundary',
  (ignored) => {
    const { child } = setup()
    const host = document.createElement(ignored === 'devframes-dock-embedded' ? ignored : 'div')
    const container = document.createElement('section')
    if (ignored === 'data-v-inspector-ignore') container.setAttribute(ignored, '')
    const button = document.createElement('button')
    container.append(button)
    host.attachShadow({ mode: 'open' }).append(container)
    document.body.append(host)
    const click = vi.fn()
    cleanups.push(events.on('click', click))
    isEnabled.value = true
    child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true }))
    expect(state.isVisible).toBe(false)
    const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })
    button.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(click).not.toHaveBeenCalled()
  },
)

it('shares overlay state across module copies without duplicate UI', async () => {
  const { child } = setup()
  vi.resetModules()
  const other = await import('../src/overlay')
  expect(other.state).toBe(state)
  state.isEnabled = true
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  expect(document.querySelectorAll('#vue-tracer-overlay')).toHaveLength(1)
})

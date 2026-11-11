// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createVNode } from 'vue'
import { recordPosition } from '../src/client'
import { createTracerOverlay } from '../src/overlay'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

function setup() {
  const onPick = vi.fn()
  const onCancel = vi.fn()
  const overlay = createTracerOverlay({ onPick, onCancel })
  cleanups.push(overlay.dispose)
  const parent = document.createElement('section')
  const child = document.createElement('span')
  parent.appendChild(child)
  document.body.appendChild(parent)
  Object.defineProperty(parent, '__vnode', {
    value: recordPosition('src/App.vue', 7, 0, createVNode('section')),
  })
  return { overlay, onPick, onCancel, parent, child }
}

it('creates the overlay only on enable and disposes all listeners and nodes', () => {
  const { overlay, onPick, onCancel, child } = setup()
  const addDocument = vi.spyOn(document, 'addEventListener')
  const removeDocument = vi.spyOn(document, 'removeEventListener')
  const addWindow = vi.spyOn(window, 'addEventListener')
  const removeWindow = vi.spyOn(window, 'removeEventListener')
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  overlay.enable()
  overlay.enable()
  expect(document.querySelectorAll('#vue-tracer-overlay')).toHaveLength(1)
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  const node = document.querySelector<HTMLElement>('#vue-tracer-overlay')!
  expect(node.hidden).toBe(false)
  expect(node.textContent).toBe('src/App.vue:7:1')
  overlay.dispose()
  overlay.dispose()
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  for (const args of addDocument.mock.calls) expect(removeDocument).toHaveBeenCalledWith(...args)
  for (const args of addWindow.mock.calls) expect(removeWindow).toHaveBeenCalledWith(...args)
  child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(onPick).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()
})

it('picks a child through its recorded parent and removes the overlay before the callback', () => {
  const { overlay, child, onPick } = setup()
  onPick.mockImplementation(() => expect(document.querySelector('#vue-tracer-overlay')).toBeNull())
  overlay.enable()
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  child.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
  expect(onPick).toHaveBeenCalledExactlyOnceWith(['src/App.vue', 7, 0])
})

it('cancels on Escape and can enable a fresh session without duplicate callbacks', () => {
  const { overlay, child, onPick, onCancel } = setup()
  overlay.enable()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  overlay.enable()
  child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(onPick).toHaveBeenCalledTimes(1)
})

it('blocks clicks without a source location and keeps picking until a recorded element is clicked', () => {
  const { overlay, onPick, child } = setup()
  const button = document.createElement('button')
  const onButtonClick = vi.fn()
  button.addEventListener('click', onButtonClick)
  document.body.appendChild(button)
  overlay.enable()
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
  expect(onButtonClick).not.toHaveBeenCalled()
  expect(onPick).not.toHaveBeenCalled()
  expect(document.querySelector('#vue-tracer-overlay')).not.toBeNull()
  child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(onPick).toHaveBeenCalledExactlyOnceWith(['src/App.vue', 7, 0])
})

it('draws the recorded ancestor rectangle with its source label', () => {
  const { overlay, parent, child } = setup()
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 50))
  const childRect = vi
    .spyOn(child, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(30, 40, 20, 10))
  overlay.enable()
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  const node = document.querySelector<HTMLElement>('#vue-tracer-overlay')!
  expect(node.textContent).toBe('src/App.vue:7:1')
  expect([node.style.left, node.style.top, node.style.width, node.style.height]).toEqual([
    '10px',
    '20px',
    '100px',
    '50px',
  ])
  expect(childRect).not.toHaveBeenCalled()

  Object.defineProperty(child, '__vnode', {
    value: recordPosition('src/App.vue', 8, 2, createVNode('span')),
  })
  child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  expect(node.textContent).toBe('src/App.vue:8:3')
  expect([node.style.left, node.style.top, node.style.width, node.style.height]).toEqual([
    '30px',
    '40px',
    '20px',
    '10px',
  ])
})

it.each(['devframes-dock-embedded', 'data-v-inspector-ignore'])(
  'passes through %s interactions across a shadow boundary',
  (ignored) => {
    const { overlay, child, onPick } = setup()
    const host = document.createElement(ignored === 'devframes-dock-embedded' ? ignored : 'div')
    Object.defineProperty(host, '__vnode', {
      value: recordPosition('src/Host.vue', 1, 0, createVNode('div')),
    })
    const shadow = host.attachShadow({ mode: 'open' })
    const container = document.createElement('section')
    if (ignored === 'data-v-inspector-ignore') container.setAttribute(ignored, '')
    const button = document.createElement('button')
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    container.appendChild(button)
    shadow.appendChild(container)
    document.body.appendChild(host)
    overlay.enable()

    child.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    const node = document.querySelector<HTMLElement>('#vue-tracer-overlay')!
    expect(node.hidden).toBe(false)
    button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true }))
    expect(node.hidden).toBe(true)
    const dockClick = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })
    button.dispatchEvent(dockClick)
    expect(dockClick.defaultPrevented).toBe(false)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
    expect(document.querySelector('#vue-tracer-overlay')).toBe(node)

    const pageClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    child.dispatchEvent(pageClick)
    expect(pageClick.defaultPrevented).toBe(true)
    expect(onPick).toHaveBeenCalledExactlyOnceWith(['src/App.vue', 7, 0])
  },
)

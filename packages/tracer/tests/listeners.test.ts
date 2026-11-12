// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createVNode } from 'vue'
import {
  ElementTraceInfo,
  events,
  isEnabled,
  lastMatchedElement,
  recordPosition,
} from '../src/listeners'

const cleanups: (() => void)[] = []
afterEach(() => {
  isEnabled.value = false
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

it('publishes enabled/disabled once and hover/click with the original event', () => {
  const el = document.createElement('button')
  Object.defineProperty(el, '__vnode', {
    value: recordPosition('App.vue', 1, 2, createVNode('button')),
  })
  document.body.append(el)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [el] })
  const enabled = vi.fn(),
    disabled = vi.fn(),
    hover = vi.fn(),
    click = vi.fn()
  cleanups.push(
    events.on('enabled', enabled),
    events.on('disabled', disabled),
    events.on('hover', hover),
    events.on('click', click),
  )
  isEnabled.value = true
  isEnabled.value = true
  const move = new PointerEvent('pointermove', { bubbles: true })
  el.dispatchEvent(move)
  el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
  expect(hover).toHaveBeenCalledExactlyOnceWith(lastMatchedElement.value, move)
  expect(lastMatchedElement.value?.pos).toEqual(['App.vue', 1, 2])
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  expect(click).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ pos: ['App.vue', 1, 2] }),
    event,
  )
  expect(event.defaultPrevented).toBe(true)
  isEnabled.value = false
  isEnabled.value = false
  expect(enabled).toHaveBeenCalledTimes(1)
  expect(disabled).toHaveBeenCalledTimes(1)
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(click).toHaveBeenCalledTimes(1)
})

it('lets unmapped clicks pass through and removes listeners independently', () => {
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] })
  const first = vi.fn(),
    second = vi.fn(),
    third = vi.fn()
  const offFirst = events.on('click', first)
  const offSecond = events.on('click', second)
  cleanups.push(events.on('click', third))
  offFirst()
  offSecond()
  isEnabled.value = true
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(third).not.toHaveBeenCalled()
  const info = new ElementTraceInfo(['App.vue', 1, 0])
  events.emit('click', info, event)
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
  expect(third).toHaveBeenCalledTimes(1)
})

it('shares refs and event listeners across separately loaded module copies', async () => {
  vi.resetModules()
  const other = await import('../src/listeners')
  expect(other.events).toBe(events)
  expect(other.isEnabled).toBe(isEnabled)
  expect(other.lastMatchedElement).toBe(lastMatchedElement)
  const el = document.createElement('button')
  Object.defineProperty(el, '__vnode', {
    value: recordPosition('App.vue', 1, 0, createVNode('button')),
  })
  document.body.append(el)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [el] })
  const click = vi.fn()
  cleanups.push(other.events.on('click', click))
  isEnabled.value = true
  other.isEnabled.value = true
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(click).toHaveBeenCalledTimes(1)
})

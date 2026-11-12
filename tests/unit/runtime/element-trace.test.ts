// @vitest-environment happy-dom
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

const runtime = createDevtoolsRuntime()
afterAll(() => runtime.dispose())
afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('traces the first matching element through the shared bridge without selecting it', async () => {
  document.body.innerHTML = '<button></button><button></button>'
  const source = vi.fn(() => ['src/App.vue', 8, 0])
  vi.stubGlobal('__VUE_DEVTOOLS_TRACER__', { getElementPosition: source })
  expect(await runtime.query({ type: 'elements:trace', payload: { selector: 'button' } })).toEqual({
    file: 'src/App.vue',
    line: 8,
    column: 0,
  })
  expect(source).toHaveBeenCalledExactlyOnceWith(document.querySelector('button'))
  expect(document.querySelector('[id^="__vue-devtools-component-inspector__"]')).toBeNull()
})

it('discovers a late tracer and returns null for missing elements or mappings', async () => {
  document.body.innerHTML = '<div></div>'
  const query = () => runtime.query({ type: 'elements:trace', payload: { selector: 'div' } })
  vi.stubGlobal('__VUE_DEVTOOLS_TRACER__', undefined)
  expect(await query()).toBeNull()
  const source = vi.fn(() => undefined)
  vi.stubGlobal('__VUE_DEVTOOLS_TRACER__', { getElementPosition: source })
  expect(await query()).toBeNull()
  expect(
    await runtime.query({ type: 'elements:trace', payload: { selector: '.missing' } }),
  ).toBeNull()
  expect(source).toHaveBeenCalledTimes(1)
  source.mockImplementation(() => {
    throw new Error('stale tracer')
  })
  expect(await query()).toBeNull()
})

it.each(['[', ' ', 'x'.repeat(2001)])('rejects invalid selectors', async (selector) => {
  await expect(runtime.query({ type: 'elements:trace', payload: { selector } })).rejects.toThrow(
    'Invalid CSS selector',
  )
})

// @vitest-environment happy-dom
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createVNode } from 'vue'
import { recordPosition } from '../src/client'
import setupTracerDevTools, { createClientScriptSetup } from '../src/devtools-client'
import { events, isEnabled } from '../src/listeners'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

function setup(active = false, onPick?: 'none') {
  const listeners = new Map<string, () => void>()
  const ctx = {
    current: {
      entryMeta: { id: 'vue-tracer' },
      isActive: active,
      events: {
        on: (event: string, callback: () => void) => {
          listeners.set(event, callback)
          return () => listeners.delete(event)
        },
      },
    },
    docks: {
      setActionActive: vi.fn(async (_id: string, active: boolean): Promise<boolean> => {
        ctx.current.isActive = active
        listeners.get(active ? 'entry:activated' : 'entry:deactivated')?.()
        return true
      }),
    },
    rpc: { call: vi.fn().mockResolvedValue(undefined) },
  }
  const dispose = (onPick ? createClientScriptSetup({ onPick }) : setupTracerDevTools)(
    ctx as unknown as DockClientScriptContext,
  )
  cleanups.push(dispose)
  return { ctx, listeners, dispose }
}

function pick() {
  const el = document.createElement('button')
  Object.defineProperty(el, '__vnode', {
    value: recordPosition('src/App.vue', 3, 0, createVNode('button')),
  })
  document.body.appendChild(el)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [el] })
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

it('opens the editor with a 1-based column and ends the dock action', () => {
  const { ctx, listeners } = setup()
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  listeners.get('entry:activated')!()
  pick()
  expect(ctx.rpc.call).toHaveBeenCalledExactlyOnceWith(
    'vite:core:open-in-editor',
    'src/App.vue:3:1',
  )
  expect(ctx.docks.setActionActive).toHaveBeenCalledWith('vue-tracer', false)
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
})

it('handles activation before setup, deactivation, and cleanup before a fresh setup', () => {
  const { listeners, dispose } = setup(true)
  expect(document.querySelector('#vue-tracer-overlay')).not.toBeNull()
  listeners.get('entry:deactivated')!()
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  listeners.get('entry:activated')!()
  dispose()
  expect(listeners.size).toBe(0)
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
  const next = setup(true)
  pick()
  expect(next.ctx.rpc.call).toHaveBeenCalledTimes(1)
})

it('ends the dock action on Escape without opening the editor', () => {
  const { ctx } = setup(true)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(ctx.docks.setActionActive).toHaveBeenCalledWith('vue-tracer', false)
  expect(ctx.rpc.call).not.toHaveBeenCalled()
})

it('warns on editor RPC rejection without leaving the picker mounted', async () => {
  const { ctx } = setup(true)
  const error = new Error('Editor unavailable')
  ctx.rpc.call.mockRejectedValue(error)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  pick()
  await Promise.resolve()
  expect(warn).toHaveBeenCalledWith(
    '[vue-devtools-tracer] Failed to open source in the editor',
    error,
  )
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()
})

it('shares the active session and ignores an older dock deactivation', () => {
  const first = setup(true)
  const second = setup(true)
  first.listeners.get('entry:deactivated')!()
  expect(document.querySelectorAll('#vue-tracer-overlay')).toHaveLength(1)
  pick()
  expect(first.ctx.rpc.call).not.toHaveBeenCalled()
  expect(second.ctx.rpc.call).toHaveBeenCalledTimes(1)
})

it('deduplicates setup for the same dock event emitter', () => {
  const first = setup(true)
  const dispose = setupTracerDevTools(first.ctx as unknown as DockClientScriptContext)
  cleanups.push(dispose)
  first.listeners.get('entry:activated')!()
  pick()
  expect(first.ctx.rpc.call).toHaveBeenCalledTimes(1)
})

it('publishes the picked element without opening an editor when onPick is none', () => {
  const click = vi.fn()
  cleanups.push(events.on('click', click))
  const { ctx } = setup(true, 'none')
  pick()
  expect(click).toHaveBeenCalledTimes(1)
  expect(ctx.rpc.call).not.toHaveBeenCalled()
  expect(ctx.docks.setActionActive).toHaveBeenCalledWith('vue-tracer', false)
})

it('shares active session ownership across independently loaded client modules', async () => {
  const first = setup(true)
  vi.resetModules()
  const other = await import('../src/devtools-client')
  const second = setup()
  second.ctx.current.isActive = true
  const dispose = other.default(second.ctx as unknown as DockClientScriptContext)
  cleanups.push(dispose)
  first.listeners.get('entry:deactivated')!()
  pick()
  expect(first.ctx.rpc.call).not.toHaveBeenCalled()
  expect(second.ctx.rpc.call).toHaveBeenCalledTimes(1)
})

it('resets the active action on module disposal and can toggle after setup again', async () => {
  const { ctx, dispose } = setup(true)
  expect(isEnabled.value).toBe(true)
  dispose() // The module HMR callback invokes this same disposer.
  expect(ctx.current.isActive).toBe(false)
  expect(ctx.docks.setActionActive).toHaveBeenCalledExactlyOnceWith('vue-tracer', false)
  expect(isEnabled.value).toBe(false)
  expect(document.querySelector('#vue-tracer-overlay')).toBeNull()

  vi.resetModules()
  const updated = await import('../src/devtools-client')
  cleanups.push(updated.default(ctx as unknown as DockClientScriptContext))
  expect(isEnabled.value).toBe(false)
  await ctx.docks.setActionActive('vue-tracer', true)
  expect(isEnabled.value).toBe(true)
  await ctx.docks.setActionActive('vue-tracer', false)
  expect(isEnabled.value).toBe(false)
  await ctx.docks.setActionActive('vue-tracer', true)
  pick()
  expect(ctx.rpc.call).toHaveBeenCalledTimes(1)
  expect(ctx.current.isActive).toBe(false)
})

it('does not reset a newer active action when disposing the previous session', () => {
  const previous = setup(true)
  const current = setup(true)
  previous.dispose()
  expect(previous.ctx.docks.setActionActive).not.toHaveBeenCalled()
  expect(current.ctx.current.isActive).toBe(true)
  expect(isEnabled.value).toBe(true)
  pick()
  expect(current.ctx.rpc.call).toHaveBeenCalledTimes(1)
})

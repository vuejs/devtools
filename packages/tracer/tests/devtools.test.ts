import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import { expect, it, vi } from 'vitest'
import VueTracer, { tracerDevTools } from '../src'

it('registers a toggle dock and a command with the Vite DevTools host', () => {
  const ctx = {
    docks: { register: vi.fn(), activate: vi.fn() },
    commands: { register: vi.fn() },
  }
  const plugin = tracerDevTools()
  type Context = Parameters<NonNullable<PluginWithDevTools['devtools']>['setup']>[0]
  plugin.devtools.setup(ctx as unknown as Context)
  expect(ctx.docks.register).toHaveBeenCalledExactlyOnceWith({
    id: 'vue-tracer',
    title: 'Inspect Vue element',
    icon: 'ph:crosshair-simple-duotone',
    type: 'action',
    toggle: true,
    action: { importFrom: '@vue/devtools-tracer/client/devtools' },
  })
  expect(ctx.commands.register).toHaveBeenCalledTimes(1)
  const command = ctx.commands.register.mock.calls[0]![0]
  expect(command).toMatchObject({
    id: 'vue-tracer:toggle-inspector',
    title: 'Pick Vue element',
    keybindings: [{ key: 'Mod+Shift+X' }],
  })
  command.handler()
  expect(ctx.docks.activate).toHaveBeenCalledWith('vue-tracer')
})

it('composes instrumentation and the standalone dock without changing the transform factory', () => {
  expect(VueTracer().map((plugin) => plugin.name)).toEqual([
    'vue-devtools:tracer-transform',
    'vue-devtools:tracer-devtools',
  ])
})

import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import { expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import VueTracer, { tracerDevTools } from '../src'

it('registers a toggle dock and a command with the Vite DevTools host', async () => {
  const ctx = {
    docks: { register: vi.fn(), activate: vi.fn() },
    commands: { register: vi.fn() },
  }
  const plugin = VueTracer()!
  type Context = Parameters<NonNullable<PluginWithDevTools['devtools']>['setup']>[0]
  await plugin.devtools!.setup(ctx as unknown as Context)
  expect(ctx.docks.register).toHaveBeenCalledExactlyOnceWith({
    id: 'vue-tracer',
    title: 'Inspect Vue component',
    description: 'Pick an element on the page to open its Vue component in the editor',
    icon: 'ph:crosshair-simple-duotone',
    type: 'action',
    toggle: true,
    action: { importFrom: '@vue/devtools-tracer/virtual-devtools?onPick=open-in-editor' },
  })
  expect(ctx.commands.register).toHaveBeenCalledTimes(1)
  const command = ctx.commands.register.mock.calls[0]![0]
  expect(command).toMatchObject({
    id: 'vue-tracer:toggle-inspector',
    title: 'Toggle Vue component inspector',
    keybindings: [{ key: 'Mod+Shift+X' }],
  })
  command.handler()
  expect(ctx.docks.activate).toHaveBeenCalledWith('vue-tracer')
})

it('includes the standalone picker by default and honors disabled tracing', () => {
  expect(VueTracer()?.devtools).toBeDefined()
  expect(VueTracer({ enabled: false })).toBeUndefined()
})

it.each(['unknown', 'none&extra=value#fragment', null])(
  'falls back to opening the editor for invalid onPick %j',
  async (onPick) => {
    const ctx = { docks: { register: vi.fn() }, commands: { register: vi.fn() } }
    const plugin = tracerDevTools({ onPick: onPick as never })
    await plugin.devtools!.setup(ctx as never)
    expect(ctx.docks.register).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: { importFrom: '@vue/devtools-tracer/virtual-devtools?onPick=open-in-editor' },
      }),
    )
  },
)

it('passes onPick through a virtual client entry without a pickOnly export', async () => {
  const plugin = tracerDevTools({ onPick: 'none' })
  if (typeof plugin.resolveId !== 'object' || typeof plugin.load !== 'function')
    throw new TypeError('Expected virtual module hooks')
  const id = await plugin.resolveId.handler.call(
    {} as never,
    '@vue/devtools-tracer/virtual-devtools?onPick=none',
    undefined,
    { isEntry: false },
  )
  if (typeof id !== 'string') throw new TypeError('Expected virtual module id')
  const code = await plugin.load.call({} as never, id)
  expect(code).toContain('createClientScriptSetup({"onPick":"none"})')
  expect(code).not.toContain('pickOnly')
  expect(await plugin.load.call({} as never, 'unrelated')).toBeUndefined()
})

it('registers one picker for multiple plugin instances on the same host', async () => {
  const ctx = {
    docks: { register: vi.fn(), activate: vi.fn() },
    commands: { register: vi.fn() },
  }
  const first = VueTracer()!
  const second = VueTracer()!
  await first.devtools!.setup(ctx as never)
  await second.devtools!.setup(ctx as never)
  expect(ctx.docks.register).toHaveBeenCalledOnce()
  expect(ctx.commands.register).toHaveBeenCalledOnce()
})

it.each(['/', '/nested/'])(
  'serves the configured picker through the host module URL with base %s',
  async (base) => {
    const server = await createServer({
      configFile: false,
      base,
      server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
      plugins: [VueTracer({ onPick: 'none' })],
    })
    try {
      await server.listen()
      const result = await fetch(
        `${server.resolvedUrls!.local[0]}@id/@vue/devtools-tracer/virtual-devtools?onPick=none`,
      )
      expect(result.ok).toBe(true)
      const code = await result.text()
      expect(code).toContain('createClientScriptSetup({"onPick":"none"})')
      expect(code).toContain('vite-devtools')
    } finally {
      await server.close()
    }
  },
)

import type { Plugin, ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'
import vueDevtools from '../../../packages/vite/src'
import VueTracer from '../../../packages/tracer/src'
import { createVueDevToolsDockRegistrationPlugin } from '../../../packages/vite/src/utils/dock/registration'

describe('Vue DevTools dock registration', () => {
  it.each([true, false])(
    'orders the standalone picker after Vue when tracer-first is %s',
    async (tracerFirst) => {
      const vuePlugin = createVueDevToolsDockRegistrationPlugin()
      const tracerPlugin = VueTracer()![1]!
      await callHook(vuePlugin.configResolved, {
        base: '/',
        devtools: { config: { mcp: false } },
      } as ResolvedConfig)
      const register = vi.fn()
      const ctx = {
        docks: { register },
        commands: { register: vi.fn() },
        views: { hostStatic: vi.fn() },
      }
      const plugins = tracerFirst ? [tracerPlugin, vuePlugin] : [vuePlugin, tracerPlugin]
      for (const plugin of plugins) await plugin.devtools!.setup(ctx as never)
      const entries = register.mock.calls.map(([entry]) => entry)
      expect(entries).toHaveLength(2)
      expect(entries.every((entry) => entry.category === 'framework' && !entry.groupId)).toBe(true)
      expect(entries.some((entry) => entry.type === 'group')).toBe(false)
      expect(entries.filter((entry) => entry.icon === 'logos:vue')).toHaveLength(1)
      expect(
        entries.sort((a, b) => a.defaultOrder - b.defaultOrder).map((entry) => entry.id),
      ).toEqual(['vue-devtools', 'vue-tracer'])
    },
  )

  it.each([
    ['/', '/__devtools__/', '/__devtools__/dock-client.js'],
    ['/nested/', '/nested/__devtools__/', '/nested/__devtools__/dock-client.js'],
  ])('registers client resources under base %j', async (base, clientUrl, clientScriptUrl) => {
    const plugin = createVueDevToolsDockRegistrationPlugin() as Plugin
    const hostStatic = vi.fn()
    const register = vi.fn()

    await callHook(plugin.configResolved, {
      base,
      devtools: { enabled: true, apply: 'all', config: {} },
    } as ResolvedConfig)
    await plugin.devtools?.setup({
      agent: { registerTool: vi.fn(() => ({ unregister: vi.fn() })) },
      docks: { register },
      views: { hostStatic },
    } as never)

    expect(hostStatic).toHaveBeenCalledOnce()
    expect(hostStatic).toHaveBeenCalledWith(
      clientUrl,
      expect.stringMatching(/packages[/\\]vite[/\\]client$/),
    )
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith({
      category: 'framework',
      defaultOrder: -2,
      clientScript: { importFrom: clientScriptUrl, eager: true },
      icon: 'logos:vue',
      id: 'vue-devtools',
      frameId: 'vue-devtools',
      title: 'Vue DevTools',
      type: 'iframe',
      url: clientUrl,
    })
  })

  it('registers the default agent surface and cleans it up with the Vite plugin', async () => {
    const plugin = createVueDevToolsDockRegistrationPlugin() as Plugin
    const unregister = vi.fn()
    const registerTool = vi.fn(() => ({ unregister }))
    const register = vi.fn()
    await plugin.devtools?.setup({
      agent: { registerTool },
      docks: { register },
      views: { hostStatic: vi.fn() },
    } as never)
    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ safety: 'read' }))
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        clientScript: { importFrom: '/__devtools__/dock-client.js', eager: true },
      }),
    )
    const close = plugin.closeBundle
    if (typeof close !== 'function') throw new TypeError('Expected closeBundle hook')
    await close.call({} as never)
    expect(unregister).toHaveBeenCalledOnce()
    expect(vueDevtools({ enabled: false })).toEqual([])
  })

  it('does not register an agent surface or eagerly load the script when the host disables MCP', async () => {
    const plugin = createVueDevToolsDockRegistrationPlugin() as Plugin
    await callHook(plugin.configResolved, {
      base: '/',
      devtools: { config: { mcp: false } },
    } as ResolvedConfig)
    const registerTool = vi.fn()
    const register = vi.fn()
    await plugin.devtools?.setup({
      agent: { registerTool },
      docks: { register },
      views: { hostStatic: vi.fn() },
    } as never)
    expect(registerTool).not.toHaveBeenCalled()
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'vue-devtools',
        clientScript: { importFrom: '/__devtools__/dock-client.js' },
      }),
    )
  })

  it.each([undefined, false, { enabled: false }, { apply: 'build' as const }])(
    'warns without starting a DevTools host when devtools is %j',
    async (devtools) => {
      const warn = vi.fn()
      const config = await resolveConfig(
        {
          configFile: false,
          devtools,
          plugins: [vueDevtools()],
          customLogger: { warn } as unknown as ResolvedConfig['logger'],
        },
        'serve',
      )
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("devtools: { apply: 'serve' }"))
      expect(
        config.plugins
          .filter((plugin) => !plugin.name.startsWith('vue-devtools:'))
          .some((plugin) => plugin.name.includes('devtools')),
      ).toBe(false)
    },
  )

  it('does not warn when the Vue integration is disabled', async () => {
    const warn = vi.fn()
    await resolveConfig(
      {
        configFile: false,
        plugins: [vueDevtools({ enabled: false })],
        customLogger: { warn } as unknown as ResolvedConfig['logger'],
      },
      'serve',
    )
    expect(warn).not.toHaveBeenCalled()
  })
})

async function callHook<T>(
  hook: { handler: (value: T) => unknown } | ((value: T) => unknown) | undefined,
  value: T,
): Promise<void> {
  if (!hook) throw new TypeError('Expected a plugin hook')
  if (typeof hook === 'function') await hook(value)
  else await hook.handler(value)
}

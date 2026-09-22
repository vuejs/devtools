import type { Plugin, ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'
import vueDevtools from '../../../packages/vite/src'
import { createVueDevToolsDockRegistrationPlugin } from '../../../packages/vite/src/utils/dock/registration'

describe('Vue DevTools dock registration', () => {
  it.each([
    ['/', '/__devtools__/', '/__devtools__/dock-client.js'],
    ['/nested/', '/nested/__devtools__/', '/nested/__devtools__/dock-client.js'],
  ])('registers client resources under base %j', async (base, clientUrl, clientScriptUrl) => {
    const plugin = createVueDevToolsDockRegistrationPlugin() as Plugin
    const hostStatic = vi.fn()
    const register = vi.fn()

    await callHook(plugin.configResolved, {
      base,
      devtools: { enabled: true, apply: 'all' },
    } as ResolvedConfig)
    await plugin.devtools?.setup({
      docks: { register },
      views: { hostStatic },
    } as never)

    expect(hostStatic).toHaveBeenCalledOnce()
    expect(hostStatic).toHaveBeenCalledWith(
      clientUrl,
      expect.stringMatching(/packages[/\\]vite[/\\]client$/),
    )
    expect(register).toHaveBeenCalledWith({
      category: 'framework',
      clientScript: { importFrom: clientScriptUrl },
      icon: 'logos:vue',
      id: 'vue-devtools',
      frameId: 'vue-devtools',
      title: 'Vue DevTools',
      type: 'iframe',
      url: clientUrl,
    })
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

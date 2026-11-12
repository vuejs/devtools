import { expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'
import VueTracer from '../src'
import vueDevtools from '../../vite/src'

vi.mock('@vue/devtools-tracer', () => import('../src'))

type TracerPlugin = NonNullable<ReturnType<typeof VueTracer>>[number]

it.each([undefined, true, false, { enabled: false }, { enabled: true }])(
  'applies the integrated tracer configuration %j',
  async (tracer) => {
    const config = await resolveConfig(
      {
        configFile: false,
        logLevel: 'silent',
        plugins: [vueDevtools({ tracer })],
      },
      'serve',
    )
    const plugins = config.plugins.filter(
      (plugin) => plugin.name === 'vue-devtools:tracer-transform',
    )
    const count =
      tracer === false || (typeof tracer === 'object' && tracer.enabled === false) ? 0 : 1
    expect(plugins).toHaveLength(count)
    const ctx = { docks: { register: vi.fn() }, commands: { register: vi.fn() } }
    for (const plugin of plugins) await (plugin as TracerPlugin).devtools!.setup(ctx as never)
    expect(ctx.docks.register).toHaveBeenCalledTimes(count)
    expect(ctx.commands.register).toHaveBeenCalledTimes(count)
  },
)

it('excludes both tracer plugins during build', async () => {
  const config = await resolveConfig(
    { configFile: false, logLevel: 'silent', plugins: [VueTracer()] },
    'build',
  )
  expect(config.plugins.some((plugin) => plugin.name.startsWith('vue-devtools:tracer-'))).toBe(
    false,
  )
})

it.each([undefined, { enabled: true, onPick: 'none' as const }])(
  'shares the same factory for standalone and integrated options %j',
  async (options) => {
    const config = await resolveConfig(
      {
        configFile: false,
        logLevel: 'silent',
        plugins: [VueTracer(options), vueDevtools({ tracer: options })],
      },
      'serve',
    )
    const ctx = {
      docks: { register: vi.fn(), activate: vi.fn() },
      commands: { register: vi.fn() },
    }
    for (const plugin of config.plugins.filter(
      (plugin) => plugin.name === 'vue-devtools:tracer-transform',
    ))
      await (plugin as TracerPlugin).devtools!.setup(ctx as never)
    expect(ctx.docks.register).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: {
          importFrom: `@vue/devtools-tracer/virtual-devtools?onPick=${options?.onPick ?? 'open-in-editor'}`,
        },
      }),
    )
    expect(ctx.commands.register).toHaveBeenCalledOnce()
  },
)

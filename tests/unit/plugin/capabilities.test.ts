import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'
import { PLUGIN_API_CAPABILITIES } from '../../../packages/kit/src/plugin/api'

describe('versioned plugin capabilities', () => {
  let kit: DevtoolsKit | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    await kit?.dispose()
    kit = undefined
  })

  function createKit(): DevtoolsKit {
    const created = createDevtoolsKit({
      target: { name: 'Capabilities Test' },
      hook: { install: false },
    })
    created.install()
    return created
  }

  it('exposes the versioned capability map on the plugin api', async () => {
    kit = createKit()
    let capabilities: Readonly<Record<string, number>> | undefined

    await kit.plugins.register({ id: 'plugin:caps' }, (api) => {
      capabilities = api.capabilities
    })

    expect(capabilities).toBe(PLUGIN_API_CAPABILITIES)
    expect(Object.isFrozen(capabilities)).toBe(true)
    expect(capabilities).toMatchObject({
      'component-hooks': expect.any(Number),
      'custom-actions': expect.any(Number),
      'custom-inspector': expect.any(Number),
      settings: expect.any(Number),
      timeline: expect.any(Number),
    })
  })

  it('turns unknown hook registrations into a diagnosable no-op instead of a crash', async () => {
    kit = createKit()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let setupCompleted = false

    await kit.plugins.register({ id: 'plugin:future' }, (api) => {
      const on = api.on as Record<string, (handler: () => void) => void>
      on.someFutureHook(() => {})
      on.someFutureHook(() => {})
      api.addInspector({ id: 'future-inspector', label: 'Future' })
      setupCompleted = true
    })

    expect(setupCompleted).toBe(true)
    await vi.waitFor(() =>
      expect(kit!.runtime.inspectors.getInfo('future-inspector')).toBeDefined(),
    )
    // one diagnosable warning per plugin + hook, no spam on repeat registrations
    const futureHookWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('plugin:future') &&
        call[0].includes('someFutureHook'),
    )
    expect(futureHookWarnings).toHaveLength(1)
  })

  it('keeps feature detection working for real hooks', async () => {
    kit = createKit()

    await kit.plugins.register({ id: 'plugin:detect' }, (api) => {
      expect('getInspectorTree' in api.on).toBe(true)
      expect('someFutureHook' in api.on).toBe(false)
    })
  })

  it('reports unknown api method calls with the plugin id instead of crashing the controller', async () => {
    kit = createKit()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let otherSetup = false

    await kit.plugins.register({ id: 'plugin:unknown-method' }, (api) => {
      ;(api as unknown as Record<string, () => void>).someFutureMethod()
    })
    await kit.plugins.register({ id: 'plugin:other' }, () => {
      otherSetup = true
    })

    expect(otherSetup).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('plugin:unknown-method'),
      expect.any(Error),
    )
  })
})

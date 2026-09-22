import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'
import { setupDevToolsPlugin } from '../../../packages/kit/src/plugin'
import { createComponentTreeFixture } from '../../fixtures'

describe('plugin API stability', () => {
  let kit: DevtoolsKit | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    await kit?.dispose()
    kit = undefined
  })

  function createKit(): DevtoolsKit {
    const created = createDevtoolsKit({
      target: { name: 'Plugin Stability Test' },
      hook: { install: false },
    })
    created.install()
    created.runtime.setCollectionActive(true, 1)
    return created
  }

  describe('hook error isolation', () => {
    it('keeps other plugins working when one hook handler throws', async () => {
      kit = createKit()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const seen: string[] = []

      await kit.plugins.register({ id: 'plugin:bad' }, (api) => {
        api.on.getInspectorTree(() => {
          throw new Error('tree boom')
        })
        api.on.timelineCleared(async () => {
          throw new Error('async boom')
        })
      })
      await kit.plugins.register({ id: 'plugin:good' }, (api) => {
        api.on.getInspectorTree(() => {
          seen.push('tree')
        })
        api.on.timelineCleared(() => {
          seen.push('cleared')
        })
      })

      await expect(
        kit.runtime.callPluginHook('getInspectorTree', { inspectorId: 'x', rootNodes: [] }),
      ).resolves.toBeUndefined()
      const cleared = await kit.runtime.command({ type: 'timeline:clear' })

      expect(cleared.status).toBe(1)
      expect(seen).toEqual(['tree', 'cleared'])
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('plugin:bad'),
        expect.any(Error),
      )
    })

    it('isolates handlers of the same plugin from each other', async () => {
      kit = createKit()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const seen: string[] = []

      await kit.plugins.register({ id: 'plugin:mixed' }, (api) => {
        api.on.getInspectorState(() => {
          throw new Error('first boom')
        })
        api.on.getInspectorState(() => {
          seen.push('second')
        })
      })

      await kit.runtime.callPluginHook('getInspectorState', { inspectorId: 'x', state: {} })

      expect(seen).toEqual(['second'])
    })

    it('keeps a malformed custom Timeline inspection isolated to that event', async () => {
      kit = createKit()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const inspected: unknown[] = []

      await kit.plugins.register({ id: 'plugin:bad-timeline' }, (api) => {
        api.on.inspectTimelineEvent(() => {
          throw new Error('malformed custom data')
        })
      })
      await kit.plugins.register({ id: 'plugin:good-timeline' }, (api) => {
        api.on.inspectTimelineEvent((payload) => {
          inspected.push(payload)
        })
      })

      const malformed = await kit.runtime.command({
        type: 'timeline:inspectEvent',
        payload: {
          pluginId: 'plugin:bad-timeline',
          layerId: 'custom',
          event: { title: 'fixture', data: { kind: 'custom' } },
        },
      })
      const valid = await kit.runtime.command({
        type: 'timeline:inspectEvent',
        payload: {
          pluginId: 'plugin:good-timeline',
          layerId: 'custom',
          event: { title: 'next', data: { kind: 'string', value: 'ok' } },
        },
      })

      expect(malformed.status).toBe(1)
      expect(valid.status).toBe(1)
      expect(inspected).toEqual([
        expect.objectContaining({
          pluginId: 'plugin:good-timeline',
          layerId: 'custom',
        }),
      ])
    })

    it('does not block later registrations when a setup function throws', async () => {
      kit = createKit()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let goodSetup = false

      kit.runtime.dispatch({
        type: 'plugin:setup',
        time: 1,
        descriptor: { id: 'plugin:bad-setup' },
        setup: () => {
          throw new Error('setup boom')
        },
      })
      kit.runtime.dispatch({
        type: 'plugin:setup',
        time: 2,
        descriptor: { id: 'plugin:good-setup' },
        setup: () => {
          goodSetup = true
        },
      })

      await vi.waitFor(() => expect(goodSetup).toBe(true))
      expect(kit.plugins.adapters.has('plugin:good-setup')).toBe(true)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('plugin:bad-setup'),
        expect.any(Error),
      )
    })

    it('swallows async setup rejections instead of rejecting register', async () => {
      kit = createKit()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        kit.plugins.register({ id: 'plugin:async-bad' }, async () => {
          throw new Error('async setup boom')
        }),
      ).resolves.toBeDefined()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('plugin:async-bad'),
        expect.any(Error),
      )
    })
  })

  describe('app lifecycle validation', () => {
    function initApp(target: DevtoolsKit) {
      const fixture = createComponentTreeFixture(2)
      target.runtime.dispatch({
        type: 'app:init',
        app: fixture.app,
        time: 1,
        version: '3.5.0',
        vueTypes: {},
      })
      return fixture
    }

    it('allows inspector registration before the app is initialized', async () => {
      kit = createKit()
      const fixture = createComponentTreeFixture(2)

      const added = await kit.runtime.command({
        type: 'inspectors:add',
        payload: {
          pluginId: 'plugin:early',
          app: fixture.app,
          options: { id: 'early-inspector', label: 'Early' },
        },
      })
      expect(added.status).toBe(1)

      kit.runtime.dispatch({
        type: 'app:init',
        app: fixture.app,
        time: 1,
        version: '3.5.0',
        vueTypes: {},
      })
      expect(kit.runtime.inspectors.list(fixture.app)).toEqual([
        expect.objectContaining({ id: 'early-inspector' }),
      ])
    })

    it('removes custom inspectors when their app unmounts', async () => {
      kit = createKit()
      const fixture = initApp(kit)
      await kit.runtime.command({
        type: 'inspectors:add',
        payload: {
          pluginId: 'plugin:test',
          app: fixture.app,
          options: { id: 'test-inspector', label: 'Test' },
        },
      })

      const changes: Array<{ inspectorId: string; reason: string }> = []
      kit.runtime.subscribe('inspectors:changed', (event) => changes.push(event))
      kit.runtime.dispatch({ type: 'app:unmount', app: fixture.app, time: 2 })

      expect(kit.runtime.inspectors.list(fixture.app)).toEqual([])
      expect(changes).toEqual([
        expect.objectContaining({ inspectorId: 'test-inspector', reason: 'remove' }),
      ])
    })

    it('rejects inspector commands for an unmounted app without dispatching events', async () => {
      kit = createKit()
      const fixture = initApp(kit)
      await kit.runtime.command({
        type: 'inspectors:add',
        payload: {
          pluginId: 'plugin:test',
          app: fixture.app,
          options: { id: 'test-inspector', label: 'Test' },
        },
      })
      kit.runtime.dispatch({ type: 'app:unmount', app: fixture.app, time: 2 })

      const dispatched: unknown[] = []
      kit.runtime.subscribe('inspectors:treeInvalidated', (event) => dispatched.push(event))
      kit.runtime.subscribe('inspectors:stateInvalidated', (event) => dispatched.push(event))

      const base = { pluginId: 'plugin:test', app: fixture.app, inspectorId: 'test-inspector' }
      const results = await Promise.all([
        kit.runtime.command({
          type: 'inspectors:add',
          payload: { ...base, options: { id: 'test-inspector', label: 'Test' } },
        }),
        kit.runtime.command({ type: 'inspectors:invalidateTree', payload: base }),
        kit.runtime.command({ type: 'inspectors:invalidateState', payload: base }),
        kit.runtime.command({
          type: 'inspectors:selectNode',
          payload: { ...base, nodeId: 'node:1' },
        }),
      ])

      for (const result of results) expect(result.status).toBe(0)
      expect(dispatched).toEqual([])
    })

    it('rejects timeline layers and events for an unmounted app', async () => {
      kit = createKit()
      const fixture = initApp(kit)
      kit.runtime.dispatch({ type: 'app:unmount', app: fixture.app, time: 2 })

      const layer = await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: {
          pluginId: 'plugin:test',
          app: fixture.app,
          options: { id: 'dead-layer', label: 'Dead', color: 0xff0000 },
        },
      })
      const event = await kit.runtime.command({
        type: 'timeline:addEvent',
        payload: {
          pluginId: 'plugin:test',
          app: fixture.app,
          options: { layerId: 'dead-layer', event: { time: Date.now(), title: 'dead' } },
        },
      })

      expect(layer.status).toBe(0)
      expect(event.status).toBe(0)
    })
  })

  describe('timeline layer ownership', () => {
    it('prevents two plugins from claiming the same layer id', async () => {
      kit = createKit()
      const first = await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: 'plugin:a', options: { id: 'shared-layer', label: 'A', color: 1 } },
      })
      const conflict = await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: 'plugin:b', options: { id: 'shared-layer', label: 'B', color: 2 } },
      })
      const reRegister = await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: 'plugin:a', options: { id: 'shared-layer', label: 'A2', color: 3 } },
      })

      expect(first.status).toBe(1)
      expect(conflict.status).toBe(0)
      expect(reRegister.status).toBe(1)
    })

    it('protects builtin layers from plugin overrides', async () => {
      kit = createKit()
      const layer = await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: 'plugin:a', options: { id: 'keyboard', label: 'Fake', color: 1 } },
      })
      const event = await kit.runtime.command({
        type: 'timeline:addEvent',
        payload: {
          pluginId: 'plugin:a',
          options: { layerId: 'keyboard', event: { time: Date.now(), title: 'fake' } },
        },
      })

      expect(layer.status).toBe(0)
      expect(event.status).toBe(0)
    })

    it('only lets the owning plugin add events to its layer', async () => {
      kit = createKit()
      await kit.runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: 'plugin:a', options: { id: 'layer-a', label: 'A', color: 1 } },
      })

      const events: Array<{ layerId: string; pluginId?: string }> = []
      kit.runtime.subscribe('timeline:eventAdded', (event) => events.push(event))

      const wrongOwner = await kit.runtime.command({
        type: 'timeline:addEvent',
        payload: {
          pluginId: 'plugin:b',
          options: { layerId: 'layer-a', event: { time: Date.now(), title: 'stolen' } },
        },
      })
      const rightOwner = await kit.runtime.command({
        type: 'timeline:addEvent',
        payload: {
          pluginId: 'plugin:a',
          options: { layerId: 'layer-a', event: { time: Date.now(), title: 'own' } },
        },
      })

      expect(wrongOwner.status).toBe(0)
      expect(rightOwner.status).toBe(1)
      expect(events).toEqual([
        expect.objectContaining({ layerId: 'layer-a', pluginId: 'plugin:a', title: 'own' }),
      ])
    })
  })

  describe('plugin setup replay', () => {
    const PLUGIN_REGISTRY_STATE = Symbol.for('vue-devtools:plugin-registry-state')

    afterEach(() => {
      delete (globalThis as Record<PropertyKey, unknown>)[PLUGIN_REGISTRY_STATE]
    })

    it('replays every setup of a plugin id after the kit is recreated', async () => {
      const calls: string[] = []
      setupDevToolsPlugin({ id: 'plugin:hmr' }, (api) => {
        api.on.getInspectorState(() => {
          calls.push('old')
        })
      })

      kit = createKit()
      await vi.waitFor(() => expect(kit?.plugins.adapters.has('plugin:hmr')).toBe(true))
      await kit.dispose()
      kit = undefined

      setupDevToolsPlugin({ id: 'plugin:hmr' }, (api) => {
        api.on.getInspectorState(() => {
          calls.push('new')
        })
      })
      kit = createKit()
      await vi.waitFor(() => expect(kit?.plugins.adapters.has('plugin:hmr')).toBe(true))

      await kit.runtime.callPluginHook('getInspectorState', { inspectorId: 'x', state: {} })

      expect(calls).toEqual(['old', 'new'])
    })

    it('keeps hooks from an earlier setup when the same plugin id is set up again', async () => {
      const calls: string[] = []
      const app = {}
      kit = createKit()
      setupDevToolsPlugin({ id: 'plugin:pinia', app }, (api) => {
        api.on.getInspectorTree((payload) => {
          calls.push('tree')
          payload.rootNodes.push({ id: '_root', label: 'Pinia' })
        })
      })
      setupDevToolsPlugin({ id: 'plugin:pinia', app }, (api) => {
        api.on.getInspectorState(() => {
          calls.push('state')
        })
      })
      await vi.waitFor(() => expect(kit?.plugins.adapters.has('plugin:pinia')).toBe(true))

      const rootNodes: Array<{ id: string }> = []
      await kit.runtime.callPluginHook('getInspectorTree', {
        app,
        inspectorId: 'pinia',
        rootNodes,
      })
      await kit.runtime.callPluginHook('getInspectorState', { inspectorId: 'pinia', state: {} })

      expect(rootNodes).toEqual([{ id: '_root', label: 'Pinia' }])
      expect(calls).toEqual(['tree', 'state'])
    })
  })
})

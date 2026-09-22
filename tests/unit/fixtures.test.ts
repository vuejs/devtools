import { describe, expect, it } from 'vitest'
import {
  createComponentTreeFixture,
  createCustomInspectorFixture,
  createDeepCyclicStateFixture,
  createKeepAliveFixture,
  createMultiAppFixture,
  createPiniaFixture,
  createTimelinePluginFixture,
} from '../fixtures'

describe('regression fixtures', () => {
  it('creates a deterministic 10k component application', () => {
    const fixture = createComponentTreeFixture(10_000)

    expect(fixture.instances).toHaveLength(10_000)
    expect(fixture.instances[9_999]?.uid).toBe(9_999)
    expect(fixture.app._instance).toBe(fixture.instances[0])
  })

  it('provides deep cyclic, KeepAlive, multi-app, inspector and timeline cases', () => {
    const cyclic = createDeepCyclicStateFixture(3)
    const keepAlive = createKeepAliveFixture()
    const apps = createMultiAppFixture()
    const inspector = createCustomInspectorFixture()
    const timeline = createTimelinePluginFixture()

    expect(cyclic.child).toBeTypeOf('object')
    expect(keepAlive.cached.parent).toBe(keepAlive.active.parent)
    expect(apps.map((app) => app._component.name)).toEqual(['Primary App', 'Secondary App'])
    expect(inspector.options.id).toBe('fixture-inspector')
    expect(timeline.event.layerId).toBe(timeline.layer.id)
  })

  it('provides a real Pinia store with boundary values', () => {
    const { store } = createPiniaFixture()

    store.increment()

    expect(store.count).toBe(1)
    expect(store.label).toBe('undefined')
    expect(store.selected).toBeNull()
  })
})

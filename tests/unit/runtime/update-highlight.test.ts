// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createComponentTreeFixture } from '../../fixtures'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import {
  UPDATE_FLASH_CAP,
  UPDATE_FLASH_CONTAINER_ID,
} from '../../../packages/kit/src/runtime/update-highlight'

describe('component update highlight', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.getElementById(UPDATE_FLASH_CONTAINER_ID)?.remove()
  })

  it('does not record duration or flash while disabled', async () => {
    const { runtime, instance } = createHighlightedFixture()
    attachBounds(instance, { left: 10, top: 20, width: 100, height: 40 })

    emitPerf(runtime, instance, 'patch', 1, 4)
    await flushFrames()

    const snapshot = await runtime.query({ appId: 'app:0', type: 'components:treeSnapshot' })
    expect(snapshot.nodes[0]?.lastUpdateMs).toBeUndefined()
    expect(document.getElementById(UPDATE_FLASH_CONTAINER_ID)).toBeNull()
    runtime.dispose()
  })

  it('records mount and patch duration only after the setting is enabled', async () => {
    const { runtime, instance } = createHighlightedFixture()

    await runtime.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: true },
    })

    emitPerf(runtime, instance, 'mount', 10, 12.5)
    emitPerf(runtime, instance, 'patch', 20, 21.25)
    await runtime.scheduler.flush()

    expect(runtime.components.includePerfMetrics).toBe(true)
    expect(runtime.registry.getComponentId(instance)).toBeDefined()
    expect(
      runtime.registry.getComponent(runtime.registry.getComponentId(instance)!)?.lastMountMs,
    ).toBe(2.5)

    const snapshot = await runtime.query({ appId: 'app:0', type: 'components:treeSnapshot' })
    const node = snapshot.nodes.find(
      (item) => item.id === runtime.registry.getComponentId(instance),
    )
    expect(node?.lastMountMs).toBe(2.5)
    expect(node?.lastUpdateMs).toBe(1.25)
    runtime.dispose()
  })

  it('flashes at most the configured number of patch bounds', async () => {
    const { runtime, instances } = createHighlightedFixture(UPDATE_FLASH_CAP + 4)
    await runtime.query({ appId: 'app:0', type: 'components:treeSnapshot' })
    await runtime.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: true },
    })

    for (const [index, instance] of instances.entries()) {
      attachBounds(instance, { left: index, top: 0, width: 10, height: 10 })
      emitPerf(runtime, instance, 'patch', index, index + 1)
    }

    await flushFrames()

    const container = document.getElementById(UPDATE_FLASH_CONTAINER_ID)
    expect(container?.childElementCount).toBe(UPDATE_FLASH_CAP)
    runtime.dispose()
  })

  it('does not flash mount-only measures', async () => {
    const { runtime, instance } = createHighlightedFixture()
    attachBounds(instance, { left: 0, top: 0, width: 20, height: 20 })
    await runtime.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: true },
    })

    emitPerf(runtime, instance, 'mount', 1, 3)
    await flushFrames()

    expect(document.getElementById(UPDATE_FLASH_CONTAINER_ID)).toBeNull()
    runtime.dispose()
  })

  it('clears flashes when highlighting is disabled', async () => {
    const { runtime, instance } = createHighlightedFixture()
    attachBounds(instance, { left: 0, top: 0, width: 20, height: 20 })
    await runtime.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: true },
    })
    emitPerf(runtime, instance, 'patch', 1, 2)
    await flushFrames()
    expect(document.getElementById(UPDATE_FLASH_CONTAINER_ID)).not.toBeNull()

    await runtime.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: false },
    })

    expect(document.getElementById(UPDATE_FLASH_CONTAINER_ID)).toBeNull()
    runtime.dispose()
  })
})

function createHighlightedFixture(count = 1) {
  const fixture = createComponentTreeFixture(count)
  const runtime = createDevtoolsRuntime()
  runtime.dispatch({
    app: fixture.app,
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })
  return { runtime, instance: fixture.instances[0]!, instances: fixture.instances }
}

function emitPerf(
  runtime: ReturnType<typeof createDevtoolsRuntime>,
  instance: object,
  phase: string,
  start: number,
  end: number,
) {
  runtime.dispatch({
    type: 'perf:start',
    time: start,
    appId: 'app:0',
    instance,
    phase,
    timestamp: start,
  })
  runtime.dispatch({
    type: 'perf:end',
    time: end,
    appId: 'app:0',
    instance,
    phase,
    timestamp: end,
  })
}

function attachBounds(
  instance: { subTree: unknown },
  rect: { left: number; top: number; width: number; height: number },
) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return rect
      },
    }) as DOMRect
  instance.subTree = { el }
  document.body.append(el)
}

async function flushFrames() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

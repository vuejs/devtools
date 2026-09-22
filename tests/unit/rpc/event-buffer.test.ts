import { describe, expect, it, vi } from 'vitest'
import { resolveRuntimeBudget } from '../../../packages/kit/src/runtime/budget'
import { createRuntimePerformanceMonitor } from '../../../packages/kit/src/runtime/performance'
import { createRuntimeEventBuffer } from '../../../packages/kit/src/rpc/event-buffer'
import { createComponentTreeFixture } from '../../fixtures'
import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

describe('runtime RPC event buffer', () => {
  it('preserves structural patch order when combining tree updates', async () => {
    const root: ComponentTreeNodeSnapshot = {
      id: 'root',
      appId: 'app:0',
      name: 'Root',
      updatedAt: 1,
    }
    const child: ComponentTreeNodeSnapshot = {
      id: 'child',
      appId: 'app:0',
      parentId: 'root',
      name: 'Child',
      updatedAt: 1,
    }
    let nodes = [root]
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget(),
      performance: createRuntimePerformanceMonitor(true),
      setBackpressurePaused: vi.fn(),
      async emit(event) {
        if (event.type === 'components:treePatched')
          nodes = applyComponentTreePatches(nodes, event.patches ?? [])
      },
    })
    buffer.enqueue({
      type: 'components:treePatched',
      appId: 'app:0',
      time: 1,
      version: 1,
      patches: [{ op: 'insert', node: child }],
    })
    buffer.enqueue({
      type: 'components:treePatched',
      appId: 'app:0',
      time: 2,
      version: 2,
      patches: [{ op: 'update', id: 'child', changes: { name: 'Updated child' } }],
    })
    await buffer.flush()
    expect(nodes.map((node) => node.name)).toEqual(['Root', 'Updated child'])
    buffer.enqueue({
      type: 'components:treePatched',
      appId: 'app:0',
      time: 3,
      version: 3,
      patches: [{ op: 'remove', id: 'root' }],
    })
    buffer.enqueue({
      type: 'components:treePatched',
      appId: 'app:0',
      time: 4,
      version: 4,
      patches: [{ op: 'insert', node: { ...root, name: 'New root' } }],
    })
    await buffer.flush()
    expect(nodes.map((node) => node.name)).toEqual(['New root'])
  })

  it('measures plugin notifications after removing cyclic application references', async () => {
    const { app } = createComponentTreeFixture(3)
    const performance = createRuntimePerformanceMonitor(true)
    const emit = vi.fn(async () => {})
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget({ transport: { maxMessageBytes: 1_024 } }),
      emit,
      performance,
      setBackpressurePaused: vi.fn(),
    })

    buffer.enqueue({ type: 'plugin:setup', time: 1, descriptor: { id: 'plugin', app }, setup() {} })
    await buffer.flush()

    expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'plugin:setup', time: 1 })
    expect(performance.snapshot().droppedEvents).toBe(0)
  })

  it('does not serialize internal Vue hook events or count them as transport drops', async () => {
    const readInstance = vi.fn(() => 'internal')
    const instance = {
      get value() {
        return readInstance()
      },
    }
    const performance = createRuntimePerformanceMonitor(true)
    const emit = vi.fn(async () => {})
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget(),
      emit,
      performance,
      setBackpressurePaused: vi.fn(),
    })

    buffer.enqueue({ type: 'component:update', time: 1, appId: 'app:0', instance })
    await buffer.flush()

    expect(readInstance).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    expect(performance.snapshot().droppedEvents).toBe(0)
  })

  it.each([
    ['drop-oldest', ['app:1', 'app:2']],
    ['drop-newest', ['app:0', 'app:1']],
    ['pause-collection', ['app:0', 'app:1']],
  ] as const)('applies the %s backpressure strategy', async (strategy, expectedAppIds) => {
    const emitted: string[] = []
    const setBackpressurePaused = vi.fn()
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget({
        timeline: { maxBufferedEvents: 2 },
        transport: { backpressure: strategy },
      }),
      async emit(event) {
        if ('appId' in event && event.appId) emitted.push(event.appId)
      },
      performance: createRuntimePerformanceMonitor(true),
      setBackpressurePaused,
    })

    for (let index = 0; index < 3; index += 1)
      buffer.enqueue({ appId: `app:${index}`, time: index, type: 'apps:changed' })
    await buffer.flush()

    expect(emitted).toEqual(expectedAppIds)
    if (strategy === 'pause-collection') {
      expect(setBackpressurePaused).toHaveBeenNthCalledWith(1, true)
      expect(setBackpressurePaused).toHaveBeenLastCalledWith(false)
    }
  })

  it('coalesces keyed updates and rate-limits timeline bursts', async () => {
    const emitted: unknown[] = []
    const performance = createRuntimePerformanceMonitor(true)
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget({
        timeline: { maxBufferedEvents: 4, maxEventsPerSecond: 2 },
        transport: { maxMessageBytes: 1_024 },
      }),
      async emit(event) {
        emitted.push(event)
      },
      performance,
      setBackpressurePaused: vi.fn(),
    })

    for (let version = 1; version <= 10; version += 1) {
      buffer.enqueue({
        appId: 'app:0',
        componentId: 'app:0:1',
        reason: 'update',
        time: version,
        type: 'components:stateInvalidated',
        version,
      })
    }
    for (let index = 0; index < 5; index += 1) {
      buffer.enqueue({
        layerId: 'stress',
        time: index,
        title: `event ${index}`,
        type: 'timeline:eventAdded',
      })
    }

    expect(performance.snapshot()).toMatchObject({
      bufferedEvents: 3,
      coalescedEvents: 9,
      droppedEvents: 3,
    })

    await buffer.flush()

    expect(emitted).toEqual([
      expect.objectContaining({
        type: 'timeline:eventsLimited',
        layerId: 'stress',
        dropped: 3,
      }),
      expect.objectContaining({ type: 'components:stateInvalidated' }),
      expect.objectContaining({ title: 'event 0', type: 'timeline:eventAdded' }),
      expect.objectContaining({ title: 'event 1', type: 'timeline:eventAdded' }),
    ])
    expect(performance.snapshot().bufferedEvents).toBe(0)
  })

  it('marks an oversized Timeline event instead of dropping it silently', async () => {
    const performance = createRuntimePerformanceMonitor(true)
    const emit = vi.fn(async () => {})
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget({ transport: { maxMessageBytes: 64 } }),
      emit,
      performance,
      setBackpressurePaused: vi.fn(),
    })

    buffer.enqueue({
      layerId: 'oversized',
      time: 1,
      title: 'x'.repeat(1_000),
      type: 'timeline:eventAdded',
    })

    expect(performance.snapshot()).toMatchObject({ bufferedBytes: 0, bufferedEvents: 0 })
    expect(performance.snapshot().droppedEvents).toBe(1)
    await buffer.flush()
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'timeline:eventsLimited',
        layerId: 'oversized',
        dropped: 1,
      }),
    )
  })

  it('keeps buffers empty during a simulated five-minute stream', async () => {
    let now = 0
    const performance = createRuntimePerformanceMonitor(true)
    const emit = vi.fn(async () => {})
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget({
        timeline: { maxBufferedEvents: 10, maxEventsPerSecond: 5 },
      }),
      emit,
      now: () => now,
      performance,
      setBackpressurePaused: vi.fn(),
    })

    for (let second = 0; second < 300; second += 1) {
      now = second * 1_000
      for (let event = 0; event < 5; event += 1) {
        buffer.enqueue({
          layerId: 'five-minute-stress',
          time: now + event,
          title: String(event),
          type: 'timeline:eventAdded',
        })
      }
      await buffer.flush()
    }

    expect(emit).toHaveBeenCalledTimes(1_500)
    expect(performance.snapshot()).toMatchObject({ bufferedBytes: 0, bufferedEvents: 0 })
  })
})

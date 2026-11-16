import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeBudget } from '../../../packages/kit/src/runtime/budget'
import { createRuntimePerformanceMonitor } from '../../../packages/kit/src/runtime/performance'
import {
  createRuntimeEventBuffer,
  exposeRuntimeTreeNode,
  invalidateRuntimeTreeNode,
  markRuntimeTreePatches,
  measureRuntimeMessageBytes,
} from '../../../packages/kit/src/rpc/event-buffer'
import { toDevtoolsRpcEvent, type DevtoolsRpcEvent } from '../../../packages/kit/src/rpc/types'
import type { RuntimeDomainEvent, RuntimeBudget } from '../../../packages/kit/src/runtime'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// The pre-optimization enqueue algorithm, restricted to tree/app events used below.
// Deliberately reserializes and recopies the entire accumulated patch prefix.
function legacyTreeBuffer(budget: RuntimeBudget) {
  const performance = createRuntimePerformanceMonitor(true)
  const paused: boolean[] = []
  const wire: string[] = []
  let isPaused = false
  let bytes = 0
  const entries: Array<{ event: DevtoolsRpcEvent; bytes: number; key?: string }> = []
  const keyed = new Map<string, (typeof entries)[number]>()
  const setPaused = (value: boolean) => {
    if (value !== isPaused) {
      isPaused = value
      paused.push(value)
    }
  }
  return {
    performance,
    paused,
    wire,
    enqueue(input: RuntimeDomainEvent) {
      const event = toDevtoolsRpcEvent(input)!
      const size = measureRuntimeMessageBytes(event)
      if (size > budget.transport.maxMessageBytes) {
        performance.recordDropped()
        return
      }
      const key = event.type === 'components:treePatched' ? `tree:${event.appId}` : undefined
      const existing = key ? keyed.get(key) : undefined
      if (existing) {
        const merged = {
          ...event,
          patches: [...(existing.event.patches ?? []), ...(event.patches ?? [])],
        }
        const mergedSize = measureRuntimeMessageBytes(merged)
        if (mergedSize <= budget.transport.maxMessageBytes) {
          bytes += mergedSize - existing.bytes
          existing.event = merged
          existing.bytes = mergedSize
          performance.recordCoalesced()
          performance.setBuffer(entries.length, bytes)
          return
        }
        existing.key = undefined
        keyed.delete(key!)
      }
      if (entries.length >= budget.timeline.maxBufferedEvents) {
        if (budget.transport.backpressure !== 'drop-oldest') {
          if (budget.transport.backpressure === 'pause-collection') setPaused(true)
          performance.recordDropped()
          return
        }
        const dropped = entries.shift()!
        if (dropped.key) keyed.delete(dropped.key)
        bytes -= dropped.bytes
        performance.recordDropped()
      }
      const entry = { event, bytes: size, key }
      entries.push(entry)
      if (key) keyed.set(key, entry)
      bytes += size
      performance.setBuffer(entries.length, bytes)
    },
    flush() {
      for (const entry of entries) wire.push(JSON.stringify(entry.event))
      performance.recordEmitted(entries.length)
      entries.length = 0
      keyed.clear()
      bytes = 0
      performance.setBuffer(0, 0)
      setPaused(false)
    },
  }
}

function equivalentBuffers(budget: RuntimeBudget) {
  const legacy = legacyTreeBuffer(budget)
  const performance = createRuntimePerformanceMonitor(true)
  const paused: boolean[] = []
  const wire: string[] = []
  const buffer = createRuntimeEventBuffer({
    budget,
    performance,
    setBackpressurePaused: (value) => {
      paused.push(value)
    },
    async emit(event) {
      wire.push(JSON.stringify(event))
    },
  })
  return {
    enqueue(event: RuntimeDomainEvent) {
      legacy.enqueue(event)
      buffer.enqueue(event)
      expect(performance.snapshot()).toEqual(legacy.performance.snapshot())
      expect(paused).toEqual(legacy.paused)
    },
    async flush() {
      legacy.flush()
      await buffer.flush()
      expect(wire).toEqual(legacy.wire)
      expect(performance.snapshot()).toEqual(legacy.performance.snapshot())
      expect(paused).toEqual(legacy.paused)
      return wire
    },
  }
}

import { createComponentTreeFixture } from '../../fixtures'
import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

describe('runtime RPC event buffer', () => {
  it.each(['drop-oldest', 'drop-newest', 'pause-collection'] as const)(
    'matches legacy wire, bytes and %s decisions for mutable runtime inserts',
    async (backpressure) => {
      for (const utf8 of [true, false]) {
        if (!utf8) vi.stubGlobal('TextEncoder', undefined)
        for (const maxMessageBytes of [256, 1024, 4096]) {
          const buffers = equivalentBuffers(
            resolveRuntimeBudget({
              transport: { maxMessageBytes, backpressure },
              timeline: { maxBufferedEvents: 2 },
            }),
          )
          const parent: ComponentTreeNodeSnapshot = {
            id: 'parent',
            appId: 'app:0',
            name: 'é🌲',
            updatedAt: 9,
            childCount: 9,
          }
          const first: RuntimeDomainEvent = {
            type: 'components:treePatched',
            appId: 'app:0',
            time: 9,
            version: 9,
            patches: [{ op: 'insert', node: parent }],
          }
          markRuntimeTreePatches(first.patches)
          buffers.enqueue(first)
          for (let index = 10; index < 110; index++) {
            parent.childCount = index
            invalidateRuntimeTreeNode(parent)
            const event: RuntimeDomainEvent = {
              type: 'components:treePatched',
              appId: 'app:0',
              time: index,
              version: index,
              patches: [
                {
                  op: 'insert',
                  node: {
                    id: `n:${index}`,
                    appId: 'app:0',
                    parentId: 'parent',
                    name: 'ü"\n🌲',
                    updatedAt: index,
                  },
                },
                { op: 'update', id: 'parent', changes: { childCount: index } },
              ],
            }
            markRuntimeTreePatches(event.patches)
            buffers.enqueue(event)
            if (index % 17 === 0)
              buffers.enqueue({ type: 'apps:changed', appId: 'other', time: index })
          }
          await buffers.flush()
        }
        vi.unstubAllGlobals()
      }
    },
  )

  it('matches the legacy exact byte boundary as childCount grows from one to two digits', async () => {
    for (const delta of [-1, 0, 1]) {
      const node = { id: 'n', appId: 'app:0', name: 'Node', updatedAt: 1, childCount: 9 }
      const first: RuntimeDomainEvent = {
        type: 'components:treePatched',
        appId: 'app:0',
        time: 9,
        version: 9,
        patches: [{ op: 'insert', node }],
      }
      const next: RuntimeDomainEvent = {
        type: 'components:treePatched',
        appId: 'app:0',
        time: 10,
        version: 10,
        patches: [{ op: 'update', id: 'n', changes: { childCount: 10 } }],
      }
      const limit =
        measureRuntimeMessageBytes({
          ...toDevtoolsRpcEvent(next),
          patches: [{ op: 'insert', node: { ...node, childCount: 10 } }, ...next.patches],
        }) + delta
      const buffers = equivalentBuffers(
        resolveRuntimeBudget({
          transport: { maxMessageBytes: limit },
          timeline: { maxBufferedEvents: 1 },
        }),
      )
      markRuntimeTreePatches(first.patches)
      markRuntimeTreePatches(next.patches)
      buffers.enqueue(first)
      node.childCount = 10
      invalidateRuntimeTreeNode(node)
      buffers.enqueue(next)
      await buffers.flush()
    }
  })

  it('revokes cached nodes and retained nested references before plugin edits', async () => {
    const buffers = equivalentBuffers(
      resolveRuntimeBudget({ transport: { maxMessageBytes: 1024 } }),
    )
    const node: ComponentTreeNodeSnapshot = {
      id: 'n',
      appId: 'app:0',
      name: 'Node',
      updatedAt: 1,
      tags: [{ label: 'before' }],
      domOrder: [1],
    }
    const insert: RuntimeDomainEvent = {
      type: 'components:treePatched',
      version: 1,
      appId: 'app:0',
      time: 1,
      patches: [{ op: 'insert', node }],
    }
    markRuntimeTreePatches(insert.patches)
    buffers.enqueue(insert)
    exposeRuntimeTreeNode(node)
    const retained = node.tags!
    node.tags!.push({ label: 'hook edit' })
    const next: RuntimeDomainEvent = {
      type: 'components:treePatched',
      version: 1,
      appId: 'app:0',
      time: 2,
      patches: [],
    }
    buffers.enqueue(next)
    retained[0]!.label = 'retained reference edited later'.repeat(10)
    buffers.enqueue({ ...next, time: 3 })
    // A new runtime snapshot can still share references previously exposed to plugins.
    const reused = { ...node, id: 'new' }
    const event: RuntimeDomainEvent = {
      ...next,
      time: 4,
      patches: [{ op: 'insert', node: reused }],
    }
    markRuntimeTreePatches(event.patches)
    buffers.enqueue(event)
    retained.push({ label: 'after the new snapshot' })
    buffers.enqueue({ ...next, time: 5 })
    await buffers.flush()
  })

  it('keeps arbitrary mutable, getter and toJSON custom patches on the legacy path', async () => {
    const buffers = equivalentBuffers(
      resolveRuntimeBudget({ transport: { maxMessageBytes: 1024 } }),
    )
    let label = 'before'
    const node = {
      id: 'n',
      appId: 'app:0',
      get name() {
        return label
      },
      updatedAt: 1,
      toJSON() {
        return { id: this.id, name: label }
      },
    }
    const event: RuntimeDomainEvent = {
      type: 'components:treePatched',
      version: 1,
      appId: 'app:0',
      time: 1,
      patches: [{ op: 'insert', node }],
    }
    buffers.enqueue(event)
    label = 'after'.repeat(150)
    buffers.enqueue({ ...event, time: 2, patches: [] })
    await buffers.flush()
  })

  it('keeps serialization work linear for a large trusted structural burst', async () => {
    const original = JSON.stringify
    const volumes: number[] = []
    for (const count of [1000, 2000]) {
      let serializedCharacters = 0
      const stringify = vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
        const result = original(...args)
        serializedCharacters += result?.length ?? 0
        return result
      })
      const emit = vi.fn(async (_event: DevtoolsRpcEvent) => {})
      const buffer = createRuntimeEventBuffer({
        budget: resolveRuntimeBudget(),
        emit,
        performance: createRuntimePerformanceMonitor(true),
        setBackpressurePaused: vi.fn(),
      })
      for (let index = 0; index < count; index++) {
        const event: RuntimeDomainEvent = {
          type: 'components:treePatched',
          appId: 'app:0',
          time: 1,
          version: 1,
          patches: [
            {
              op: 'insert',
              node: { id: `n:${index}`, appId: 'app:0', name: 'Node', updatedAt: 1 },
            },
          ],
        }
        markRuntimeTreePatches(event.patches)
        buffer.enqueue(event)
      }
      await buffer.flush()
      stringify.mockRestore()
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit.mock.calls[0]![0].patches).toHaveLength(count)
      volumes.push(serializedCharacters)
    }
    expect(volumes[1]! / volumes[0]!).toBeLessThan(2.1)
  })

  it('invalidates insert measurements when the runtime updates childCount', async () => {
    const runtime = createDevtoolsRuntime()
    const fixture = createComponentTreeFixture(22)
    const root = fixture.instances[0]!
    root.subTree.children = []
    const buffers = equivalentBuffers(resolveRuntimeBudget())
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    const stop = runtime.subscribe('components:treePatched', (event) => buffers.enqueue(event))
    const branch = fixture.instances[1]!
    branch.subTree.children = []
    root.subTree.children.push({ component: branch })
    runtime.dispatch({
      type: 'component:add',
      appId: 'app:0',
      instance: branch,
      parent: root,
      time: 2,
    })
    for (const instance of fixture.instances.slice(2)) {
      instance.parent = branch
      branch.subTree.children.push({ component: instance })
      runtime.dispatch({ type: 'component:add', appId: 'app:0', instance, parent: branch, time: 3 })
    }
    const wire = await buffers.flush()
    const inserted = JSON.parse(wire[0]!).patches.find(
      (patch: { op: string }) => patch.op === 'insert',
    )
    expect(inserted.node.childCount).toBe(20)
    stop()
    runtime.dispose()
  })

  it('revokes snapshots through the real visitComponentTree hook before retained edits', async () => {
    const runtime = createDevtoolsRuntime()
    const fixture = createComponentTreeFixture(2)
    const buffers = equivalentBuffers(
      resolveRuntimeBudget({ transport: { maxMessageBytes: 1024 } }),
    )
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const retained: ComponentTreeNodeSnapshot[] = []
    vi.spyOn(runtime, 'callPluginHook').mockImplementation(async (key, payload) => {
      if (key !== 'visitComponentTree') return
      const node = (payload as { treeNode: ComponentTreeNodeSnapshot }).treeNode
      retained.push(node)
      // If exposure has not revoked trust, this explicitly marked insert would cache stale tags.
      const event: RuntimeDomainEvent = {
        type: 'components:treePatched',
        version: 1,
        appId: 'app:0',
        time: 1,
        patches: [{ op: 'insert', node }],
      }
      markRuntimeTreePatches(event.patches)
      buffers.enqueue(event)
      node.tags!.push({ label: 'hook edit' })
      buffers.enqueue({ ...event, time: 2, patches: [] })
      await buffers.flush()
    })
    await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    await buffers.flush()
    const event: RuntimeDomainEvent = {
      type: 'components:treePatched',
      version: 1,
      appId: 'app:0',
      time: 3,
      patches: [{ op: 'insert', node: retained[0]! }],
    }
    markRuntimeTreePatches(event.patches)
    buffers.enqueue(event)
    retained[0]!.tags!.push({ label: 'retained after hook' })
    buffers.enqueue({ ...event, time: 4, patches: [] })
    await buffers.flush()
    runtime.dispose()
  })

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

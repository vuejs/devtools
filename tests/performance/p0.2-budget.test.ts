import { performance as clock } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentSnapshot } from '../../packages/client/src/composables/devtools-client'
import { encodeValue } from '../../packages/kit/src/codec/encode'
import { buildComponentTree } from '../../packages/client/src/composables/component-tree'
import { resolveRuntimeBudget } from '../../packages/kit/src/runtime/budget'
import { createRuntimePerformanceMonitor } from '../../packages/kit/src/runtime/performance'
import { createDevtoolsRuntime } from '../../packages/kit/src/runtime/runtime'
import { createRuntimeEventBuffer } from '../../packages/kit/src/rpc/event-buffer'
import { createComponentTreeFixture } from '../fixtures'

const MAX_TREE_SNAPSHOT_MS = 500
const MAX_TREE_SEARCH_MS = 250
const MAX_EVENT_BURST_MS = 250
const MAX_STATE_ENCODE_MS = 250
const MAX_10K_HEAP_GROWTH_BYTES = 128 * 1024 * 1024

describe('P0.2 performance budgets', () => {
  it('keeps the 10k component initial snapshot shallow and search responsive', async () => {
    const initialHeap = process.memoryUsage().heapUsed
    const fixture = createComponentTreeFixture(10_000)
    const runtime = createDevtoolsRuntime()
    runtime.dispatch({
      app: fixture.app,
      time: 1,
      type: 'app:init',
      version: '3.5.0',
      vueTypes: {},
    })

    const snapshotStarted = clock.now()
    const snapshot = await runtime.query({
      appId: 'app:0',
      type: 'components:treeSnapshot',
    })
    const snapshotDuration = clock.now() - snapshotStarted

    const allComponents = fixture.instances.map((instance): ComponentSnapshot => ({
      appId: 'app:0',
      id: `app:0:${instance.uid}`,
      name: instance.type.name,
      parentId: instance.parent ? `app:0:${instance.parent.uid}` : undefined,
      updatedAt: 1,
    }))
    const searchStarted = clock.now()
    const searchResult = buildComponentTree(allComponents, 'FixtureComponent9999')
    const searchDuration = clock.now() - searchStarted

    expect(snapshot.nodes.length).toBeLessThanOrEqual(421)
    expect(snapshotDuration).toBeLessThan(MAX_TREE_SNAPSHOT_MS)
    expect(searchResult).toHaveLength(1)
    expect(searchDuration).toBeLessThan(MAX_TREE_SEARCH_MS)
    expect(process.memoryUsage().heapUsed - initialHeap).toBeLessThan(MAX_10K_HEAP_GROWTH_BYTES)
    runtime.dispose()
  })

  it('bounds a 1k events-per-second burst and drains its buffer', async () => {
    const emitted = vi.fn(async () => {})
    const monitor = createRuntimePerformanceMonitor(true)
    const buffer = createRuntimeEventBuffer({
      budget: resolveRuntimeBudget(),
      emit: emitted,
      now: () => 1_000,
      performance: monitor,
      setBackpressurePaused: vi.fn(),
    })

    const started = clock.now()
    for (let index = 0; index < 1_000; index += 1) {
      buffer.enqueue({
        data: encodeValue({ index }),
        layerId: 'benchmark',
        time: index,
        title: `event ${index}`,
        type: 'timeline:eventAdded',
      })
    }
    const enqueueDuration = clock.now() - started

    expect(monitor.snapshot().bufferedEvents).toBe(500)
    expect(monitor.snapshot().droppedEvents).toBe(500)
    expect(enqueueDuration).toBeLessThan(MAX_EVENT_BURST_MS)

    await buffer.flush()
    expect(emitted).toHaveBeenCalledTimes(501)
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'timeline:eventsLimited',
        layerId: 'benchmark',
        dropped: 500,
      }),
    )
    expect(monitor.snapshot()).toMatchObject({ bufferedBytes: 0, bufferedEvents: 0 })
  })

  it('keeps a large state snapshot within encoding and message budgets', () => {
    const largeState = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`entry-${index}`, 'x'.repeat(100)]),
    )
    const started = clock.now()
    const encoded = encodeValue(largeState, {
      maxDepth: 2,
      maxEntries: 100,
      maxStringLength: 10_000,
    })
    const duration = clock.now() - started
    const bytes = new TextEncoder().encode(JSON.stringify(encoded)).byteLength

    expect(duration).toBeLessThan(MAX_STATE_ENCODE_MS)
    expect(bytes).toBeLessThan(2 * 1024 * 1024)
    expect(encoded).toMatchObject({ kind: 'object', entries: 10_000 })
    expect('preview' in encoded ? encoded.preview : []).toHaveLength(100)
  })
})

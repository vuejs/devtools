import type { RuntimeBudget, RuntimeDomainEvent, RuntimePerformanceMonitor } from '../runtime'
import { toDevtoolsRpcEvent, type DevtoolsRpcEvent } from './types'
import type { ComponentTreePatch } from '../protocol'

interface BufferedRuntimeEvent {
  bytes: number
  event: DevtoolsRpcEvent
  key?: string
  tree?: TreeAccumulator
}

interface PatchMeasurement {
  trusted: boolean
  listeners: Set<(trusted: boolean) => void>
}

const runtimePatches = new WeakMap<ComponentTreePatch, PatchMeasurement>()
const patchDependencies = new WeakMap<object, Set<PatchMeasurement>>()
const exposedObjects = new WeakSet<object>()

// Only the tree store can opt in. Custom events retain the full serialization path.
export function markRuntimeTreePatches(patches: ComponentTreePatch[]): void {
  for (const patch of patches) {
    if (runtimePatches.has(patch)) continue
    const objects = new Set<object>()
    if (!collectPlainObjects(patch, objects)) continue
    const measurement: PatchMeasurement = { trusted: true, listeners: new Set() }
    runtimePatches.set(patch, measurement)
    for (const object of objects) {
      const dependencies = patchDependencies.get(object) ?? new Set()
      dependencies.add(measurement)
      patchDependencies.set(object, dependencies)
    }
  }
}

function collectPlainObjects(value: unknown, objects: Set<object>): boolean {
  if (value === null || typeof value !== 'object')
    return typeof value !== 'function' && typeof value !== 'bigint' && typeof value !== 'symbol'
  if (objects.has(value) || exposedObjects.has(value)) return false
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype))
    return false
  objects.add(value)
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === 'toJSON' || !('value' in descriptor)) return false
    if (!collectPlainObjects(descriptor.value, objects)) return false
  }
  return true
}

export function invalidateRuntimeTreeNode(node: object): void {
  for (const measurement of patchDependencies.get(node) ?? [])
    for (const listener of measurement.listeners) listener(measurement.trusted)
}

// Plugins can retain any nested reference, so revocation survives the hook call.
export function exposeRuntimeTreeNode(node: object, seen = new Set<object>()): void {
  if (seen.has(node)) return
  seen.add(node)
  exposedObjects.add(node)
  for (const measurement of patchDependencies.get(node) ?? []) {
    measurement.trusted = false
    for (const listener of measurement.listeners) listener(false)
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(node))) {
    if ('value' in descriptor && descriptor.value && typeof descriptor.value === 'object')
      exposeRuntimeTreeNode(descriptor.value, seen)
  }
}

class TreeAccumulator {
  readonly patches: ComponentTreePatch[] = []
  private measurements = new Map<ComponentTreePatch, { bytes: number; count: number }>()
  private dirty = new Set<ComponentTreePatch>()
  private disposers: Array<() => void> = []
  private bytes = 0
  trusted = true

  constructor(event: DevtoolsRpcEvent) {
    this.append(event.patches ?? [])
  }

  append(patches: ComponentTreePatch[]): void {
    for (const patch of patches) {
      let cached = this.measurements.get(patch)
      if (!cached) {
        cached = { bytes: measureRuntimeMessageBytes(patch), count: 0 }
        this.measurements.set(patch, cached)
        const measurement = runtimePatches.get(patch)!
        const listener = (trusted: boolean) => {
          this.trusted &&= trusted
          this.dirty.add(patch)
        }
        measurement.listeners.add(listener)
        this.disposers.push(() => measurement.listeners.delete(listener))
      }
      cached.count++
      this.bytes += cached.bytes
      this.patches.push(patch)
    }
  }

  mergedBytes(next: DevtoolsRpcEvent): number {
    for (const patch of this.dirty) {
      const cached = this.measurements.get(patch)!
      const bytes = measureRuntimeMessageBytes(patch)
      this.bytes += (bytes - cached.bytes) * cached.count
      cached.bytes = bytes
    }
    this.dirty.clear()
    const patches = next.patches ?? []
    const separatorBytes = typeof TextEncoder === 'undefined' ? 2 : 1
    return (
      measureRuntimeMessageBytes({ ...next, patches: [] }) +
      this.bytes +
      patches.reduce((sum, patch) => sum + measureRuntimeMessageBytes(patch), 0) +
      Math.max(0, this.patches.length + patches.length - 1) * separatorBytes
    )
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose()
  }
}

function canAccumulateTree(event: DevtoolsRpcEvent): boolean {
  return (
    event.type === 'components:treePatched' &&
    Object.keys(event).every((key) =>
      ['type', 'time', 'appId', 'version', 'patches'].includes(key),
    ) &&
    (event.patches ?? []).every((patch) => runtimePatches.get(patch)?.trusted)
  )
}

export interface RuntimeEventBuffer {
  enqueue(event: RuntimeDomainEvent): void
  flush(): Promise<void>
  clear(): void
}

export interface CreateRuntimeEventBufferOptions {
  budget: RuntimeBudget
  emit(event: DevtoolsRpcEvent): Promise<void>
  performance: RuntimePerformanceMonitor
  setBackpressurePaused(paused: boolean): void
  now?: () => number
}

export function createRuntimeEventBuffer(
  options: CreateRuntimeEventBufferOptions,
): RuntimeEventBuffer {
  const entries: BufferedRuntimeEvent[] = []
  const keyedEntries = new Map<string, BufferedRuntimeEvent>()
  const timelineEventTimes: number[] = []
  const timelineLimits = new Map<string, { dropped: number; coalesced: number }>()
  let bufferedBytes = 0
  let flushPending = false
  let backpressurePaused = false

  function enqueue(runtimeEvent: RuntimeDomainEvent): void {
    const event = toDevtoolsRpcEvent(runtimeEvent)
    if (!event) return
    if (event.type === 'timeline:eventAdded' && !allowTimelineEvent()) {
      options.performance.recordDropped()
      recordTimelineLimit(event, 'dropped')
      scheduleFlush()
      return
    }

    const bytes = measureRuntimeMessageBytes(event)
    if (bytes > options.budget.transport.maxMessageBytes) {
      options.performance.recordDropped()
      if (event.type === 'timeline:eventAdded') {
        recordTimelineLimit(event, 'dropped')
        scheduleFlush()
      }
      return
    }

    const key = getCoalescingKey(event)
    const existing = key ? keyedEntries.get(key) : undefined
    if (existing) {
      const tree = existing.tree?.trusted && canAccumulateTree(event) ? existing.tree : undefined
      const mergedEvent = tree ? undefined : mergeRuntimeEvents(existing.event, event)
      const mergedBytes = tree ? tree.mergedBytes(event) : measureRuntimeMessageBytes(mergedEvent)
      if (mergedBytes <= options.budget.transport.maxMessageBytes) {
        bufferedBytes -= existing.bytes
        if (tree) {
          tree.append(event.patches ?? [])
          existing.event = { ...event, patches: tree.patches }
        } else {
          existing.tree?.dispose()
          existing.tree = undefined
          existing.event = mergedEvent!
        }
        existing.bytes = mergedBytes
        bufferedBytes += existing.bytes
        options.performance.recordCoalesced()
        updateMetrics()
        scheduleFlush()
        return
      }

      existing.key = undefined
      keyedEntries.delete(key!)
    }

    if (entries.length >= options.budget.timeline.maxBufferedEvents) {
      if (options.budget.transport.backpressure === 'drop-newest') {
        options.performance.recordDropped()
        if (event.type === 'timeline:eventAdded') recordTimelineLimit(event, 'dropped')
        return
      }

      if (options.budget.transport.backpressure === 'pause-collection') {
        setBackpressurePaused(true)
        options.performance.recordDropped()
        if (event.type === 'timeline:eventAdded') recordTimelineLimit(event, 'dropped')
        return
      }

      dropOldest()
    }

    const entry: BufferedRuntimeEvent = {
      bytes,
      event,
      key,
      tree: canAccumulateTree(event) ? new TreeAccumulator(event) : undefined,
    }
    entries.push(entry)
    if (key) keyedEntries.set(key, entry)
    bufferedBytes += bytes
    updateMetrics()
    scheduleFlush()
  }

  async function flush(): Promise<void> {
    flushPending = false
    if (!entries.length && !timelineLimits.size) {
      setBackpressurePaused(false)
      return
    }

    const batch = entries.splice(0, entries.length)
    for (const entry of batch) entry.tree?.dispose()
    const limits = [...timelineLimits.entries()]
    timelineLimits.clear()
    keyedEntries.clear()
    bufferedBytes = 0
    updateMetrics()
    setBackpressurePaused(false)

    const limitResults = await Promise.allSettled(
      limits.map(([layerId, counts]) =>
        options.emit({
          type: 'timeline:eventsLimited',
          time: Date.now(),
          layerId,
          dropped: counts.dropped,
          coalesced: counts.coalesced,
        }),
      ),
    )
    const results = await Promise.allSettled(batch.map((entry) => options.emit(entry.event)))
    const emitted = results.filter((result) => result.status === 'fulfilled').length
    const dropped = results.length - emitted
    if (emitted) options.performance.recordEmitted(emitted)
    if (dropped) options.performance.recordDropped(dropped)
    for (let index = 0; index < results.length; index += 1) {
      const entry = batch[index]
      if (results[index]?.status === 'rejected' && entry?.event.type === 'timeline:eventAdded')
        recordTimelineLimit(entry.event, 'dropped')
    }
    const droppedLimits = limitResults.filter((result) => result.status === 'rejected').length
    if (droppedLimits) options.performance.recordDropped(droppedLimits)

    if (entries.length || timelineLimits.size) scheduleFlush()
  }

  function clear(): void {
    for (const entry of entries) entry.tree?.dispose()
    entries.splice(0, entries.length)
    keyedEntries.clear()
    timelineEventTimes.splice(0, timelineEventTimes.length)
    timelineLimits.clear()
    bufferedBytes = 0
    flushPending = false
    setBackpressurePaused(false)
    updateMetrics()
  }

  function allowTimelineEvent(): boolean {
    if (!options.budget.timeline.enabled) return false

    const now = options.now?.() ?? Date.now()
    while (timelineEventTimes.length && timelineEventTimes[0]! <= now - 1_000)
      timelineEventTimes.shift()
    if (timelineEventTimes.length >= options.budget.timeline.maxEventsPerSecond) return false

    timelineEventTimes.push(now)
    return true
  }

  function dropOldest(): void {
    const dropped = entries.shift()
    if (!dropped) return
    dropped.tree?.dispose()
    if (dropped.key) keyedEntries.delete(dropped.key)
    bufferedBytes -= dropped.bytes
    options.performance.recordDropped()
    if (dropped.event.type === 'timeline:eventAdded') recordTimelineLimit(dropped.event, 'dropped')
  }

  function recordTimelineLimit(event: DevtoolsRpcEvent, kind: 'dropped' | 'coalesced'): void {
    if (!event.layerId) return
    const current = timelineLimits.get(event.layerId) ?? { dropped: 0, coalesced: 0 }
    current[kind] += 1
    timelineLimits.set(event.layerId, current)
  }

  function scheduleFlush(): void {
    if (flushPending) return
    flushPending = true
    queueMicrotask(() => void flush())
  }

  function setBackpressurePaused(paused: boolean): void {
    if (backpressurePaused === paused) return
    backpressurePaused = paused
    options.setBackpressurePaused(paused)
  }

  function updateMetrics(): void {
    options.performance.setBuffer(entries.length, bufferedBytes)
  }

  return { clear, enqueue, flush }
}

function getCoalescingKey(event: DevtoolsRpcEvent): string | undefined {
  switch (event.type) {
    case 'components:treePatched':
      return `tree:${event.appId}`
    case 'components:stateInvalidated':
      return `state:${event.appId}:${event.componentId}`
    case 'components:changed':
      return `component:${event.appId}:${event.componentId ?? 'unknown'}`
    case 'inspectors:treeInvalidated':
      return `inspector-tree:${event.appId ?? 'all'}:${event.inspectorId}`
    case 'inspectors:stateInvalidated':
      return `inspector-state:${event.appId ?? 'all'}:${event.inspectorId}:${event.nodeId ?? ''}`
  }
}

function mergeRuntimeEvents(previous: DevtoolsRpcEvent, next: DevtoolsRpcEvent): DevtoolsRpcEvent {
  if (previous.type !== 'components:treePatched' || next.type !== 'components:treePatched')
    return next

  // Structural operations depend on earlier patches: an update cannot replace
  // its insert, and a reinsert must still remove the previous subtree first.
  return { ...next, patches: [...(previous.patches ?? []), ...(next.patches ?? [])] }
}

export function measureRuntimeMessageBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return 0
    return typeof TextEncoder === 'undefined'
      ? serialized.length * 2
      : new TextEncoder().encode(serialized).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

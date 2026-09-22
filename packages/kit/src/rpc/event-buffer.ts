import type { RuntimeBudget, RuntimeDomainEvent, RuntimePerformanceMonitor } from '../runtime'
import { toDevtoolsRpcEvent, type DevtoolsRpcEvent } from './types'

interface BufferedRuntimeEvent {
  bytes: number
  event: DevtoolsRpcEvent
  key?: string
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
      const mergedEvent = mergeRuntimeEvents(existing.event, event)
      const mergedBytes = measureRuntimeMessageBytes(mergedEvent)
      if (mergedBytes <= options.budget.transport.maxMessageBytes) {
        bufferedBytes -= existing.bytes
        existing.event = mergedEvent
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

    const entry = { bytes, event, key }
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

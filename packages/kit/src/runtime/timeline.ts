import type { EncodedValue, ValueHandleRegistry } from '../codec'
import type { AppId, InstanceRef } from './types'
import type { DevtoolsRuntime } from './runtime'
import { encodeValue } from '../codec'

interface PerformanceStartEvent {
  type: 'perf:start'
  time: number
  appId: AppId
  instance: InstanceRef
  phase: string
  timestamp: number
}

interface PerformanceEndEvent {
  type: 'perf:end'
  time: number
  appId: AppId
  instance: InstanceRef
  phase: string
  timestamp: number
}

interface RuntimeTimelineState {
  recording: boolean
  disabledLayerIds: Set<string>
  layerOwners: Map<string, string>
  perfGroups: WeakMap<InstanceRef, Map<string, { groupId: number; startTime: number }>>
  perfEndQueue: WeakMap<InstanceRef, Map<string, PerformanceEndEvent>>
  groupSeed: number
  eventTimes: number[]
  droppedByLayer: Map<string, number>
  limitFlushPending: boolean
  disposed: boolean
}

interface TimelineEventInput {
  appId?: AppId
  pluginId?: string
  all?: boolean
  layerId: string
  title: string
  subtitle?: string
  data?: unknown
  meta?: unknown
  groupId?: number
  logType?: 'default' | 'warning' | 'error'
  time?: number
}

export interface RuntimeTimelineController {
  addEvent(event: TimelineEventInput): void
  claimLayer(layerId: string, ownerId: string): boolean
  dispose(): void
  getLayerOwner(layerId: string): string | undefined
  setDisabledLayerIds(layerIds: string[]): void
  setRecording(recording: boolean): void
  shouldRecord(layerId: string): boolean
}

const BUILTIN_LAYER_OWNER = 'vue-devtools:builtin'

const BUILTIN_TIMELINE_LAYERS = [
  { id: 'mouse', label: 'Mouse', color: 0xa451af },
  { id: 'keyboard', label: 'Keyboard', color: 0x8151af },
  { id: 'component-event', label: 'Component events', color: 0x4fc08d },
  { id: 'performance', label: 'Performance', color: 0x41b86a },
] as const

const MOUSE_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick'] as const
const KEYBOARD_EVENTS = ['keyup', 'keydown', 'keypress'] as const

export function createRuntimeTimeline(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
): RuntimeTimelineController {
  const state: RuntimeTimelineState = {
    recording: true,
    disabledLayerIds: new Set(),
    layerOwners: new Map(),
    perfGroups: new WeakMap(),
    perfEndQueue: new WeakMap(),
    groupSeed: 0,
    eventTimes: [],
    droppedByLayer: new Map(),
    limitFlushPending: false,
    disposed: false,
  }
  const disposers: Array<() => void> = []

  for (const layer of BUILTIN_TIMELINE_LAYERS) {
    state.layerOwners.set(layer.id, BUILTIN_LAYER_OWNER)
    runtime.events.dispatch({
      type: 'timeline:layerAdded',
      time: Date.now(),
      layerId: layer.id,
      label: layer.label,
      color: layer.color,
    })
  }

  if (typeof window !== 'undefined') {
    for (const eventType of MOUSE_EVENTS) {
      const handler = (event: MouseEvent) => {
        if (!shouldRecord(state, 'mouse')) return
        dispatchTimelineEvent(runtime, handles, state, {
          layerId: 'mouse',
          title: eventType,
          data: {
            type: eventType,
            x: event.clientX,
            y: event.clientY,
          },
        })
      }

      window.addEventListener(eventType, handler, { capture: true, passive: true })
      disposers.push(() => window.removeEventListener(eventType, handler, { capture: true }))
    }

    for (const eventType of KEYBOARD_EVENTS) {
      const handler = (event: KeyboardEvent) => {
        if (!shouldRecord(state, 'keyboard')) return
        dispatchTimelineEvent(runtime, handles, state, {
          layerId: 'keyboard',
          title: event.key || eventType,
          data: {
            type: eventType,
            key: event.key,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          },
        })
      }

      window.addEventListener(eventType, handler, { capture: true, passive: true })
      disposers.push(() => window.removeEventListener(eventType, handler, { capture: true }))
    }
  }

  disposers.push(
    runtime.subscribe('component:emit', (event) => {
      if (!shouldRecord(state, 'component-event')) return

      const component = runtime.registry.getComponentId(event.instance)
      const componentRecord = component
        ? runtime.registry.getComponent(component, event.appId)
        : undefined
      const componentName = componentRecord?.name ?? 'Unknown Component'

      dispatchTimelineEvent(runtime, handles, state, {
        appId: event.appId,
        layerId: 'component-event',
        title: event.event,
        subtitle: `by ${componentName}`,
        data: {
          component: {
            _custom: {
              type: 'component-definition',
              display: componentName,
            },
          },
          event: event.event,
          params: event.args,
        },
        meta: componentRecord ? { componentId: componentRecord.id } : undefined,
      })
    }),
  )

  disposers.push(
    runtime.subscribe('perf:start', (event) => {
      if (!shouldRecord(state, 'performance')) return
      addPerformanceStart(runtime, handles, state, event)
    }),
  )

  disposers.push(
    runtime.subscribe('perf:end', (event) => {
      if (!shouldRecord(state, 'performance')) return
      addPerformanceEnd(runtime, handles, state, event)
    }),
  )

  return {
    addEvent(event) {
      dispatchTimelineEvent(runtime, handles, state, event)
    },
    claimLayer(layerId, ownerId) {
      const currentOwner = state.layerOwners.get(layerId)
      if (currentOwner != null && currentOwner !== ownerId) return false
      state.layerOwners.set(layerId, ownerId)
      return true
    },
    dispose() {
      state.disposed = true
      state.droppedByLayer.clear()
      state.eventTimes.length = 0
      disposers.forEach((dispose) => dispose())
      state.layerOwners.clear()
      state.perfGroups = new WeakMap()
      state.perfEndQueue = new WeakMap()
    },
    getLayerOwner(layerId) {
      return state.layerOwners.get(layerId)
    },
    setDisabledLayerIds(layerIds) {
      state.disabledLayerIds = new Set(layerIds)
      if (state.disabledLayerIds.has('performance')) {
        state.perfGroups = new WeakMap()
        state.perfEndQueue = new WeakMap()
      }
    },
    setRecording(recording) {
      state.recording = recording
      if (!recording) {
        state.perfGroups = new WeakMap()
        state.perfEndQueue = new WeakMap()
      }
    },
    shouldRecord(layerId) {
      return runtime.isCollectionActive() && shouldRecord(state, layerId)
    },
  }
}

function addPerformanceStart(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
  state: RuntimeTimelineState,
  event: PerformanceStartEvent,
) {
  const componentId = runtime.registry.getComponentId(event.instance)
  const componentRecord = componentId
    ? runtime.registry.getComponent(componentId, event.appId)
    : undefined
  const componentName = componentRecord?.name ?? 'Unknown Component'
  const groupId = state.groupSeed++
  // The registry ID can change from undefined to an ID between start and end.
  const groupKey = `${event.appId}:${event.phase}`
  let groups = state.perfGroups.get(event.instance)
  if (!groups) state.perfGroups.set(event.instance, (groups = new Map()))
  groups.set(groupKey, { groupId, startTime: event.timestamp })

  dispatchTimelineEvent(runtime, handles, state, {
    appId: event.appId,
    layerId: 'performance',
    title: componentName,
    subtitle: event.phase,
    groupId,
    data: {
      component: componentName,
      type: event.phase,
      measure: 'start',
    },
  })

  const queuedEnds = state.perfEndQueue.get(event.instance)
  const queuedEnd = queuedEnds?.get(groupKey)
  if (queuedEnd) {
    queuedEnds!.delete(groupKey)
    addPerformanceEnd(runtime, handles, state, queuedEnd)
  }
}

function addPerformanceEnd(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
  state: RuntimeTimelineState,
  event: PerformanceEndEvent,
) {
  const componentId = runtime.registry.getComponentId(event.instance)
  const groupKey = `${event.appId}:${event.phase}`
  const groups = state.perfGroups.get(event.instance)
  const group = groups?.get(groupKey)

  if (!group) {
    let queuedEnds = state.perfEndQueue.get(event.instance)
    if (!queuedEnds) state.perfEndQueue.set(event.instance, (queuedEnds = new Map()))
    queuedEnds.set(groupKey, event)
    return
  }

  const componentRecord = componentId
    ? runtime.registry.getComponent(componentId, event.appId)
    : undefined
  const componentName = componentRecord?.name ?? 'Unknown Component'
  const duration = Math.max(0, event.timestamp - group.startTime)
  groups!.delete(groupKey)

  dispatchTimelineEvent(runtime, handles, state, {
    appId: event.appId,
    layerId: 'performance',
    title: componentName,
    subtitle: event.phase,
    groupId: group.groupId,
    data: {
      component: componentName,
      type: event.phase,
      measure: 'end',
      duration: {
        _custom: {
          type: 'Duration',
          value: duration,
          display: `${Number(duration.toFixed(3))} ms`,
        },
      },
    },
  })
}

function dispatchTimelineEvent(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
  state: RuntimeTimelineState,
  event: TimelineEventInput,
) {
  if (
    !runtime.budget.timeline.enabled ||
    !runtime.isCollectionActive() ||
    !shouldRecord(state, event.layerId)
  )
    return

  // Bound work before encoding: the transport limit alone still serializes
  // every event in a render burst, including events that will be discarded.
  const now = Date.now()
  while (state.eventTimes.length && state.eventTimes[0]! <= now - 1_000) state.eventTimes.shift()
  if (state.eventTimes.length >= runtime.budget.timeline.maxEventsPerSecond) {
    runtime.performance.recordDropped()
    state.droppedByLayer.set(event.layerId, (state.droppedByLayer.get(event.layerId) ?? 0) + 1)
    if (!state.limitFlushPending) {
      state.limitFlushPending = true
      queueMicrotask(() => {
        state.limitFlushPending = false
        if (state.disposed) return
        const limits = [...state.droppedByLayer]
        state.droppedByLayer.clear()
        for (const [layerId, dropped] of limits)
          runtime.events.dispatch({
            type: 'timeline:eventsLimited',
            time: Date.now(),
            layerId,
            dropped,
            coalesced: 0,
          })
      })
    }
    return
  }
  state.eventTimes.push(now)

  runtime.events.dispatch({
    type: 'timeline:eventAdded',
    time: event.time ?? Date.now(),
    appId: event.appId,
    layerId: event.layerId,
    pluginId: event.pluginId,
    all: event.all,
    title: event.title,
    subtitle: event.subtitle,
    data: encodeTimelineValue(runtime, handles, event.data),
    meta: encodeTimelineMeta(runtime, handles, event.meta),
    groupId: event.groupId,
    logType: event.logType,
  })
}

function encodeTimelineValue(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
  value: unknown,
): EncodedValue | undefined {
  if (value === undefined) return

  return encodeValue(value, {
    handles,
    maxDepth: runtime.budget.state.lazyChildren ? 1 : runtime.budget.state.maxDepth,
    maxEntries: runtime.budget.state.maxEntries,
    maxStringLength: runtime.budget.state.maxStringLength,
  })
}

function encodeTimelineMeta(
  runtime: DevtoolsRuntime,
  handles: ValueHandleRegistry,
  value: unknown,
): EncodedValue | undefined {
  if (value === undefined) return

  return encodeValue(value, {
    handles,
    maxDepth: 1,
    maxEntries: runtime.budget.state.maxEntries,
    maxStringLength: runtime.budget.state.maxStringLength,
  })
}

function shouldRecord(state: RuntimeTimelineState, layerId: string): boolean {
  return state.recording && !state.disabledLayerIds.has(layerId)
}

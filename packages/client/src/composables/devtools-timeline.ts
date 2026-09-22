import type { EncodedValue } from '@vue/devtools-kit'
import type { DevtoolsRpcClient, DevtoolsRpcEvent } from '@vue/devtools-kit/client'
import { ref, shallowRef, watch } from 'vue'

export interface TimelineEntry {
  id: number
  type: string
  time: number
  label: string
  appId?: string
  pluginId?: string
  layerId?: string
  title?: string
  subtitle?: string
  data?: EncodedValue
  meta?: EncodedValue
  groupId?: number
  logType?: 'default' | 'warning' | 'error'
  all?: boolean
  dropped?: number
  coalesced?: number
}

export interface TimelineLayerEntry {
  id: string
  label: string
  appId?: string
  pluginId?: string
  color?: number
}

interface TimelineRpcEvent extends Omit<DevtoolsRpcEvent, 'type'> {
  type: 'timeline:eventAdded' | 'timeline:eventsLimited'
  dropped?: number
  coalesced?: number
}

const TIMELINE_BATCH_SIZE = 250
const TIMELINE_HISTORY_LIMIT = 5_000
const TIMELINE_PENDING_LIMIT = 5_000
const TIMELINE_SETTINGS_STORAGE = 'vue-devtools-next:timeline-settings'

interface StoredTimelineSettings {
  recording: boolean
  disabledLayerIds: string[]
  selectedLayerId: string
}

export function createDevtoolsTimeline(getRpcClient: () => DevtoolsRpcClient | undefined) {
  const initialTimelineSettings = readTimelineSettings()
  const timeline = shallowRef<TimelineEntry[]>([])
  const timelineLayers = shallowRef<TimelineLayerEntry[]>([])
  const timelineRecording = ref(initialTimelineSettings.recording)
  const disabledTimelineLayerIds = ref<Set<string>>(
    new Set(initialTimelineSettings.disabledLayerIds),
  )
  const selectedTimelineLayerId = ref(initialTimelineSettings.selectedLayerId)
  let eventSeed = 0
  let timelineQueueGeneration = 0
  let timelineFlushPending = false
  const pendingTimelineEvents: Array<TimelineRpcEvent | undefined> = []
  let pendingHead = 0
  let pendingCount = 0
  let pendingDropped = 0

  watch(
    [timelineRecording, disabledTimelineLayerIds, selectedTimelineLayerId],
    () => {
      writeTimelineSettings({
        recording: timelineRecording.value,
        disabledLayerIds: [...disabledTimelineLayerIds.value],
        selectedLayerId: selectedTimelineLayerId.value,
      })
    },
    { deep: true },
  )

  function handleTimelineEvent(event: DevtoolsRpcEvent) {
    if (event.type === 'timeline:layerAdded' && event.layerId) {
      upsertTimelineLayer({
        id: event.layerId,
        label: event.label ?? formatTimelineLayerLabel(event.layerId),
        appId: event.appId,
        pluginId: event.pluginId,
        color: event.color,
      })
    }

    if (
      (event.type === 'timeline:eventAdded' ||
        (event.type as string) === 'timeline:eventsLimited') &&
      event.layerId &&
      timelineRecording.value &&
      isTimelineLayerEnabled(event.layerId)
    )
      enqueueTimelineEvent(event as TimelineRpcEvent)
  }

  function resetTimeline() {
    timeline.value = []
    timelineLayers.value = []
    eventSeed = 0
    discardPendingTimelineEvents()
  }

  function enqueueTimelineEvent(event: TimelineRpcEvent) {
    if (pendingCount === TIMELINE_PENDING_LIMIT) {
      const removed = pendingTimelineEvents[pendingHead]
      pendingDropped += removed?.type === 'timeline:eventsLimited' ? (removed.dropped ?? 0) : 1
      pendingTimelineEvents[pendingHead] = event
      pendingHead = (pendingHead + 1) % TIMELINE_PENDING_LIMIT
    } else {
      pendingTimelineEvents[(pendingHead + pendingCount) % TIMELINE_PENDING_LIMIT] = event
      pendingCount++
    }
    scheduleFlush()
  }

  function scheduleFlush() {
    if (timelineFlushPending) return
    timelineFlushPending = true
    const generation = timelineQueueGeneration
    scheduleTimelineTask(() => {
      if (generation !== timelineQueueGeneration || !timelineRecording.value) return
      timelineFlushPending = false
      flushTimelineEvents()
    })
  }

  function flushTimelineEvents() {
    const batch: TimelineRpcEvent[] = []
    if (pendingDropped) {
      batch.push({
        type: 'timeline:eventsLimited',
        time: Date.now(),
        layerId: 'timeline',
        dropped: pendingDropped,
        subtitle: 'Client pending queue limit reached',
      })
      pendingDropped = 0
    }
    while (pendingCount && batch.length < TIMELINE_BATCH_SIZE) {
      batch.push(pendingTimelineEvents[pendingHead]!)
      pendingTimelineEvents[pendingHead] = undefined
      pendingHead = (pendingHead + 1) % TIMELINE_PENDING_LIMIT
      pendingCount--
    }
    if (!batch.length) return

    for (const event of batch) {
      const layerId = event.layerId
      if (!layerId || !isTimelineLayerEnabled(layerId)) continue
      upsertTimelineLayer({
        id: layerId,
        label: formatTimelineLayerLabel(layerId),
        appId: event.appId,
        pluginId: event.pluginId,
      })
    }

    const appended = batch.flatMap((event) => {
      const layerId = event.layerId
      if (!layerId || !isTimelineLayerEnabled(layerId)) return []
      const limited = event.type === 'timeline:eventsLimited'
      const dropped = event.dropped ?? 0
      const coalesced = event.coalesced ?? 0
      return [
        {
          id: eventSeed++,
          type: event.type,
          time: event.time ?? Date.now(),
          label: limited
            ? formatTimelineLimitLabel(dropped, coalesced)
            : (event.title ?? event.type.replaceAll(':', ' ')),
          appId: event.appId,
          pluginId: event.pluginId,
          layerId,
          title: limited ? formatTimelineLimitLabel(dropped, coalesced) : event.title,
          subtitle: limited ? (event.subtitle ?? 'Runtime event limit reached') : event.subtitle,
          data: event.data,
          meta: event.meta,
          groupId: event.groupId,
          logType: limited ? ('warning' as const) : event.logType,
          all: event.all,
          dropped,
          coalesced,
        },
      ]
    })

    const combined = [...timeline.value, ...appended]
    if (combined.length > TIMELINE_HISTORY_LIMIT) {
      const droppedEntries = combined.length - TIMELINE_HISTORY_LIMIT + 1
      const firstDroppedLayer = combined[0]?.layerId ?? 'timeline'
      timeline.value = [
        ...combined.slice(-(TIMELINE_HISTORY_LIMIT - 1)),
        {
          id: eventSeed++,
          type: 'timeline:eventsLimited',
          time: Date.now(),
          label: formatTimelineLimitLabel(droppedEntries, 0),
          layerId: firstDroppedLayer,
          title: formatTimelineLimitLabel(droppedEntries, 0),
          subtitle: 'Client history limit reached',
          logType: 'warning',
          dropped: droppedEntries,
          coalesced: 0,
        },
      ]
    } else {
      timeline.value = combined
    }

    if (pendingCount) scheduleFlush()
  }

  function scheduleTimelineTask(task: () => void) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => task())
    else setTimeout(task, 0)
  }

  function discardPendingTimelineEvents() {
    pendingTimelineEvents.splice(0, pendingTimelineEvents.length)
    pendingHead = 0
    pendingCount = 0
    pendingDropped = 0
    timelineQueueGeneration += 1
    timelineFlushPending = false
  }

  function formatTimelineLimitLabel(dropped: number, coalesced: number): string {
    if (dropped && coalesced) return 'Events dropped and coalesced'
    if (dropped) return 'Events dropped'
    if (coalesced) return 'Events coalesced'
    return 'Timeline events limited'
  }

  function upsertTimelineLayer(layer: TimelineLayerEntry) {
    const index = timelineLayers.value.findIndex((item) => item.id === layer.id)
    if (index === -1) {
      timelineLayers.value = [...timelineLayers.value, layer]
      return
    }

    timelineLayers.value = timelineLayers.value.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            ...layer,
            label: layer.label || item.label,
            color: layer.color ?? item.color,
          }
        : item,
    )
  }

  function formatTimelineLayerLabel(layerId: string): string {
    return layerId
      .split(/[-:]/g)
      .filter(Boolean)
      .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
      .join(' ')
  }

  function clearTimelineEvents() {
    discardPendingTimelineEvents()
    timeline.value = []
    eventSeed = 0
    void getRpcClient()
      ?.command({ type: 'timeline:clear' })
      .catch(() => {})
  }

  function toggleTimelineRecording() {
    timelineRecording.value = !timelineRecording.value
    if (!timelineRecording.value) discardPendingTimelineEvents()
    void syncTimelineSettings()
  }

  async function inspectTimelineEvent(event: TimelineEntry) {
    if (!event.pluginId) return
    await getRpcClient()
      ?.command({
        type: 'timeline:inspectEvent',
        appId: event.appId,
        payload: {
          pluginId: event.pluginId,
          layerId: event.layerId,
          event: {
            time: event.time,
            title: event.title ?? event.label,
            subtitle: event.subtitle,
            data: event.data,
            meta: event.meta,
            groupId: event.groupId,
            logType: event.logType,
            all: event.all,
          },
        },
      })
      .catch(() => {})
  }

  function toggleTimelineLayerEnabled(layerId: string) {
    const disabled = new Set(disabledTimelineLayerIds.value)
    if (disabled.has(layerId)) disabled.delete(layerId)
    else disabled.add(layerId)
    disabledTimelineLayerIds.value = disabled
    void syncTimelineSettings()
  }

  function isTimelineLayerEnabled(layerId: string): boolean {
    return !disabledTimelineLayerIds.value.has(layerId)
  }

  function selectTimelineLayer(layerId: string) {
    selectedTimelineLayerId.value = layerId
  }

  async function syncTimelineSettings(client = getRpcClient()) {
    await client
      ?.command({
        type: 'timeline:setRecording',
        payload: {
          recording: timelineRecording.value,
          disabledLayerIds: [...disabledTimelineLayerIds.value],
        },
      })
      .catch(() => {})
  }

  function formatTime(time?: number): string {
    if (!time) return '-'
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(time)
  }

  function readTimelineSettings(): StoredTimelineSettings {
    const fallback: StoredTimelineSettings = {
      recording: true,
      disabledLayerIds: [],
      selectedLayerId: '',
    }

    if (typeof window === 'undefined') return fallback

    try {
      const raw = window.localStorage.getItem(TIMELINE_SETTINGS_STORAGE)
      if (!raw) return fallback

      const value = JSON.parse(raw) as unknown
      if (!value || typeof value !== 'object') return fallback

      const record = value as Partial<StoredTimelineSettings>
      return {
        recording: typeof record.recording === 'boolean' ? record.recording : fallback.recording,
        disabledLayerIds: Array.isArray(record.disabledLayerIds)
          ? record.disabledLayerIds.filter(
              (layerId): layerId is string => typeof layerId === 'string',
            )
          : fallback.disabledLayerIds,
        selectedLayerId:
          typeof record.selectedLayerId === 'string'
            ? record.selectedLayerId
            : fallback.selectedLayerId,
      }
    } catch {
      return fallback
    }
  }

  function writeTimelineSettings(settings: StoredTimelineSettings) {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(TIMELINE_SETTINGS_STORAGE, JSON.stringify(settings))
    } catch {}
  }

  return {
    timeline,
    timelineLayers,
    timelineRecording,
    disabledTimelineLayerIds,
    selectedTimelineLayerId,
    clearTimelineEvents,
    toggleTimelineRecording,
    inspectTimelineEvent,
    toggleTimelineLayerEnabled,
    isTimelineLayerEnabled,
    selectTimelineLayer,
    syncTimelineSettings,
    formatTime,
    discardPendingTimelineEvents,
    handleTimelineEvent,
    resetTimeline,
  }
}

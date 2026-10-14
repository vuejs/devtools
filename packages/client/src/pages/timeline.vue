<script setup lang="ts">
import type { EncodedValue, ValueEntry } from '@vue/devtools-kit'
import type { TimelineEntry, TimelineLayerEntry } from '../composables/devtools-client'
import AppList from '@components/components/AppList.vue'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import RecycleScroller from 'vue-virtual-scroller/components/RecycleScroller'
import { useDevtoolsClient } from '../composables/devtools-client'

interface TimelineEventRow extends TimelineEntry {
  color: string
  delta?: number
  grouped: boolean
  repeatsTitle: boolean
  groupStart: boolean
  groupEnd: boolean
}

interface InfoRow {
  key: string
  value: string
  children?: InfoRow[]
}

interface InfoSection {
  id: string
  label: string
  rows: InfoRow[]
}

interface RecycleScrollerHandle {
  scrollToItem: (index: number) => void
}

const LIMITED_COLOR = '#a17646'
const EVENT_ROW_HEIGHT = 28
const BUILTIN_LAYERS: TimelineLayerEntry[] = [
  { id: 'mouse', label: 'Mouse' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'component-event', label: 'Component events' },
  { id: 'performance', label: 'Performance' },
]

const {
  apps,
  clearTimelineEvents,
  formatValue,
  isTimelineLayerEnabled,
  inspectTimelineEvent,
  selectedTimelineLayerId,
  selectedAppId,
  selectTimelineLayer,
  timeline,
  timelineLayers,
  timelineRecording,
  toggleTimelineLayerEnabled,
  toggleTimelineRecording,
} = useDevtoolsClient()

const container = ref<HTMLElement>()
const horizontal = ref(false)
const activeTimelineLayer = selectedTimelineLayerId
const selectedEventId = ref<number>()
const collapsedSections = ref(new Set<string>())
const eventListScroller = ref<RecycleScrollerHandle>()

let observer: ResizeObserver | undefined

const currentAppEvents = computed(() =>
  timeline.value.filter(
    (event) => !event.appId || !selectedAppId.value || event.appId === selectedAppId.value,
  ),
)

const layerOptions = computed<TimelineLayerEntry[]>(() => {
  const layers = new Map<string, TimelineLayerEntry>()

  for (const layer of BUILTIN_LAYERS) layers.set(layer.id, layer)

  for (const layer of timelineLayers.value) {
    if (layer.appId && selectedAppId.value && layer.appId !== selectedAppId.value) continue
    layers.set(layer.id, layer)
  }

  for (const event of currentAppEvents.value) {
    if (!event.layerId || layers.has(event.layerId)) continue
    layers.set(event.layerId, { id: event.layerId, label: formatLayerLabel(event.layerId) })
  }

  return [...layers.values()]
})

const selectedLayerEvents = computed(() =>
  currentAppEvents.value.filter(
    (event) =>
      event.layerId === activeTimelineLayer.value &&
      event.layerId &&
      isTimelineLayerEnabled(event.layerId),
  ),
)

const eventRows = computed<TimelineEventRow[]>(() => {
  const events = selectedLayerEvents.value
  const color = selectedLayer.value ? getLayerColor(selectedLayer.value) : '#42b983'

  return events.map((event, index) => {
    const prev = events[index - 1]
    const next = events[index + 1]
    const inGroup = (other?: TimelineEntry) =>
      event.groupId != null && other?.groupId === event.groupId
    return {
      ...event,
      color: event.type === 'timeline:eventsLimited' ? LIMITED_COLOR : color,
      delta: prev && event.time >= prev.time ? event.time - prev.time : undefined,
      grouped: inGroup(prev),
      groupStart: !inGroup(prev) && inGroup(next),
      repeatsTitle: inGroup(prev) && (prev!.title ?? prev!.label) === (event.title ?? event.label),
      groupEnd: inGroup(prev) && !inGroup(next),
    }
  })
})
const selectedEvent = computed(
  () =>
    eventRows.value.find((event) => event.id === selectedEventId.value) ??
    eventRows.value[eventRows.value.length - 1],
)

const selectedLayer = computed(() =>
  layerOptions.value.find((layer) => layer.id === activeTimelineLayer.value),
)

const infoSections = computed<InfoSection[]>(() => {
  const event = selectedEvent.value
  if (!event) return []

  const sections: InfoSection[] = []
  sections.push({ id: 'event', label: 'Event', rows: createEventInfoRows(event) })

  if (event.data)
    sections.push({ id: 'data', label: 'Data', rows: createEncodedValueRows(event.data) })

  if (event.meta)
    sections.push({ id: 'meta', label: 'Meta', rows: createEncodedValueRows(event.meta) })

  const groupRows = createGroupInfoRows(event)
  if (groupRows.length) sections.push({ id: 'group', label: 'Group', rows: groupRows })

  return sections
})

watch(
  layerOptions,
  (layers) => {
    if (layers.some((layer) => layer.id === activeTimelineLayer.value)) return
    selectTimelineLayer(layers[0]?.id ?? '')
  },
  { immediate: true },
)

watch(
  eventRows,
  async (events) => {
    if (events.some((event) => event.id === selectedEventId.value)) return
    selectedEventId.value = events[events.length - 1]?.id
    await nextTick()
    eventListScroller.value?.scrollToItem(events.length - 1)
  },
  { immediate: true },
)

function toggleSection(id: string) {
  const next = new Set(collapsedSections.value)
  if (!next.delete(id)) next.add(id)
  collapsedSections.value = next
}

function selectLayer(layerId: string) {
  selectTimelineLayer(layerId)
}

function toggleLayerEnabled(layerId: string) {
  toggleTimelineLayerEnabled(layerId)
}

function isLayerEnabled(layerId: string): boolean {
  return isTimelineLayerEnabled(layerId)
}

function selectEvent(eventId: number) {
  selectedEventId.value = eventId
  const event = eventRows.value.find((item) => item.id === eventId)
  if (event) void inspectTimelineEvent(event)
}

function clearEvents() {
  clearTimelineEvents()
  selectedEventId.value = undefined
}

function createEventInfoRows(event: TimelineEventRow): InfoRow[] {
  const rows: InfoRow[] = [
    { key: 'title', value: event.title ?? event.label },
    { key: 'timestamp', value: formatClock(event.time) },
  ]

  if (event.delta != null) rows.push({ key: 'delta', value: formatDelta(event.delta) })

  if (event.subtitle) rows.push({ key: 'subtitle', value: event.subtitle })
  if (event.layerId) rows.push({ key: 'layer', value: event.layerId })
  if (event.logType) rows.push({ key: 'logType', value: event.logType })

  return rows
}

function createGroupInfoRows(event: TimelineEntry): InfoRow[] {
  if (event.groupId == null) return []

  const groupEvents = selectedLayerEvents.value.filter((item) => item.groupId === event.groupId)
  if (!groupEvents.length) return []

  const start = groupEvents[0]!.time
  const end = groupEvents[groupEvents.length - 1]!.time

  return [
    { key: 'events', value: String(groupEvents.length) },
    { key: 'duration', value: `${Math.max(0, end - start)}ms` },
  ]
}

function createEncodedValueRows(value: EncodedValue): InfoRow[] {
  const rows = previewRows(value)
  return rows.length ? rows : [{ key: 'value', value: formatValue(value) }]
}

function previewRows(value: EncodedValue): InfoRow[] {
  return getTimelineValuePreview(value).map((entry) => ({
    key: entry.key,
    value: formatValue(entry.value),
    children: previewRows(entry.value).slice(0, 5),
  }))
}

function getTimelineValuePreview(value: EncodedValue): ValueEntry[] {
  if (!value || typeof value !== 'object') return []
  if (value.kind === 'custom')
    return value.value && typeof value.value === 'object'
      ? getTimelineValuePreview(value.value)
      : []
  return 'preview' in value && Array.isArray(value.preview) ? value.preview.slice(0, 12) : []
}

function formatClock(time: number): string {
  const date = new Date(time)
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function formatDelta(delta: number | undefined): string {
  if (delta == null) return ''
  if (delta < 1000) return `+${Math.max(0, Math.round(delta))}ms`
  if (delta < 60_000) return `+${(delta / 1000).toFixed(1)}s`
  return `+${Math.round(delta / 60_000)}m`
}

function getLayerColor(layer: TimelineLayerEntry): string {
  return layer.color == null ? '#42b983' : `#${layer.color.toString(16).padStart(6, '0')}`
}

function formatLayerLabel(layerId: string): string {
  return layerId
    .split(/[-:]/g)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ')
}

function getTimelineLogTypeClass(logType: string | undefined): string {
  switch (logType) {
    case 'error':
      return 'text-red-500 dark:text-red-300'
    case 'warning':
      return 'text-amber-500 dark:text-amber-300'
    default:
      return ''
  }
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    horizontal.value = entry.contentRect.width < 700
  })
  if (container.value) observer.observe(container.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div ref="container" class="h-full w-full">
    <Splitpanes class="h-full min-h-0 overflow-hidden" :horizontal="horizontal">
      <Pane v-if="apps.length > 1" class="h-full min-h-0" min-size="12" size="18">
        <AppList />
      </Pane>

      <Pane class="h-full min-h-0" min-size="20" :size="apps.length > 1 ? 22 : 25">
        <div class="h-full min-h-0 flex flex-col p-2">
          <div
            class="relative mb-1 min-h-7 w-full shrink-0 flex items-center justify-end border-b border-b-dashed border-base pb-1"
          >
            <span
              v-if="!timelineRecording"
              class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-300 dark:text-gray-500"
            >
              Not recording
            </span>
            <div class="flex items-center gap-2 px-1">
              <button
                v-tooltip.bottom-end="
                  timelineRecording
                    ? 'Stop recording'
                    : 'Start recording — Timeline recording may add overhead in large applications.'
                "
                class="h-6 w-6 border-0 bg-transparent p-0 flex items-center justify-center"
                type="button"
                :aria-label="timelineRecording ? 'Stop recording' : 'Start recording'"
                @click="toggleTimelineRecording"
              >
                <span
                  class="h-3.5 w-3.5 cursor-pointer rounded-full inline-flex"
                  :class="
                    timelineRecording
                      ? 'recording bg-#ef4444'
                      : 'bg-black op70 hover:op100 dark:bg-white'
                  "
                  aria-hidden="true"
                />
              </button>
              <button
                v-tooltip.bottom-end="'Clear all timelines'"
                class="h-6 w-6 border-0 bg-transparent p-0 color-muted flex items-center justify-center hover:color-base"
                type="button"
                aria-label="Clear all timelines"
                @click="clearEvents"
              >
                <span class="i-ic-baseline-delete text-xl" aria-hidden="true" />
              </button>
            </div>
          </div>

          <ul class="no-scrollbar m-0 min-h-0 flex-1 list-none overflow-auto p-2">
            <li
              v-for="layer in layerOptions"
              :key="layer.id"
              class="group relative min-h-7 cursor-pointer rounded-1 px-2 py-1 color-base flex items-center gap-2 text-3.5 hover:bg-active"
              :class="{
                'active bg-primary-600! text-white hover:bg-primary-600!':
                  layer.id === activeTimelineLayer,
                op60: !isLayerEnabled(layer.id),
              }"
              @click="selectLayer(layer.id)"
            >
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: getLayerColor(layer) }"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate">{{ layer.label }}</span>
              <button
                class="absolute right-2 rounded-1 border-0 bg-primary-500 px-1 color-white text-3 op0 group-hover:op80 hover:op100 [.active_&]:(bg-primary-400 dark:bg-gray-600)"
                type="button"
                :aria-label="isLayerEnabled(layer.id) ? 'Disable layer' : 'Enable layer'"
                @click.stop="toggleLayerEnabled(layer.id)"
              >
                {{ isLayerEnabled(layer.id) ? 'Disable' : 'Enable' }}
              </button>
            </li>
          </ul>
        </div>
      </Pane>

      <Pane class="h-full min-h-0" :size="apps.length > 1 ? 60 : 75" min-size="40">
        <div class="relative h-full min-h-0 flex flex-col">
          <template v-if="eventRows.length">
            <Splitpanes class="h-full min-h-0">
              <Pane class="h-full min-h-0" min-size="30" size="40">
                <div class="h-full min-h-0 box-border py-2">
                  <RecycleScroller
                    ref="eventListScroller"
                    class="no-scrollbar h-full min-h-0 select-none overflow-auto"
                    :items="eventRows"
                    :item-size="EVENT_ROW_HEIGHT"
                    key-field="id"
                    list-tag="ul"
                    item-tag="li"
                    list-class="m-0 list-none p-0"
                    item-class="block w-full"
                    :buffer="520"
                    :prerender="20"
                  >
                    <template #default="{ item: event }">
                      <div
                        class="relative h-7 cursor-pointer pl-3 pr-3 flex items-center gap-3 text-3.25 hover:bg-#8881"
                        :class="{ 'bg-#8882! hover:bg-#8882': selectedEvent?.id === event.id }"
                        @click="selectEvent(event.id)"
                      >
                        <span
                          class="relative h-full w-3 shrink-0 flex items-center justify-center"
                          aria-hidden="true"
                        >
                          <span
                            v-if="event.grouped || event.groupStart"
                            class="absolute left-1/2 w-0 border-l border-l-solid border-gray-300 dark:border-gray-600"
                            :class="
                              event.groupStart
                                ? 'top-1/2 h-1/2'
                                : event.groupEnd
                                  ? 'top-0 h-1/2'
                                  : 'top-0 h-full'
                            "
                          />
                          <span
                            v-if="event.grouped"
                            class="absolute left-1/2 top-1/2 w-1.5 border-t border-t-solid border-gray-300 dark:border-gray-600"
                          />
                          <span
                            v-else
                            class="h-2 w-2 rounded-full"
                            :style="{ backgroundColor: event.color }"
                          />
                        </span>
                        <span
                          v-if="!event.repeatsTitle || !event.subtitle"
                          class="min-w-0 truncate"
                          :class="
                            event.type === 'timeline:eventsLimited'
                              ? undefined
                              : getTimelineLogTypeClass(event.logType) || 'color-base'
                          "
                          :style="
                            event.type === 'timeline:eventsLimited'
                              ? { color: event.color }
                              : undefined
                          "
                        >
                          {{ event.title ?? event.label }}
                        </span>
                        <span
                          v-if="event.subtitle && !event.groupStart"
                          class="max-w-2/5 shrink-0 truncate color-muted op70"
                        >
                          {{ event.subtitle }}
                        </span>
                        <span
                          class="ml-auto w-23 shrink-0 text-right font-mono text-3 color-muted tabular-nums"
                        >
                          <span class="op50">{{ formatClock(event.time).slice(0, 6) }}</span
                          >{{ formatClock(event.time).slice(6) }}
                        </span>
                      </div>
                    </template>
                  </RecycleScroller>
                </div>
              </Pane>

              <Pane class="h-full min-h-0" min-size="36" size="60">
                <div class="no-scrollbar h-full min-h-0 overflow-auto p-5">
                  <section v-for="section in infoSections" :key="section.id" class="mb-3">
                    <button
                      class="w-full cursor-pointer border-0 bg-transparent p-0 color-inherit flex items-center"
                      type="button"
                      :aria-expanded="!collapsedSections.has(section.id)"
                      @click="toggleSection(section.id)"
                    >
                      <span
                        class="i-carbon-chevron-right flex-none text-4 op50 transition-transform"
                        :class="{ 'rotate-90': !collapsedSections.has(section.id) }"
                        aria-hidden="true"
                      />
                      <span class="font-state-field text-3.5 text-#a3a3a3">
                        {{ section.label }}
                      </span>
                    </button>
                    <div
                      v-if="!collapsedSections.has(section.id)"
                      class="font-state-field grid grid-cols-[max-content_auto_minmax(0,1fr)] pl-5 text-3.5"
                    >
                      <template v-for="row in section.rows" :key="`${section.id}-${row.key}`">
                        <span class="state-key py-0.5 op70">{{ row.key }}</span>
                        <span class="colon mx-1 py-0.5">:</span>
                        <span class="state-value min-w-0 break-all py-0.5">{{ row.value }}</span>
                        <div
                          v-if="row.children?.length"
                          class="col-span-3 grid grid-cols-[max-content_auto_minmax(0,1fr)] pl-4"
                        >
                          <template
                            v-for="child in row.children"
                            :key="`${section.id}-${row.key}-${child.key}`"
                          >
                            <span class="state-key py-0.5 op70">{{ child.key }}</span>
                            <span class="colon mx-1 py-0.5">:</span>
                            <span class="state-value min-w-0 break-all py-0.5">{{
                              child.value
                            }}</span>
                          </template>
                        </div>
                      </template>
                    </div>
                  </section>
                </div>
              </Pane>
            </Splitpanes>
          </template>

          <div v-else class="min-h-0 flex-1 flex items-center justify-center color-muted">
            <div class="text-center">
              <div class="mx-auto mb-3 h-10 w-10 flex items-center justify-center">
                <span class="i-carbon-time text-9 op70" aria-hidden="true" />
              </div>
              <div>No events</div>
              <div v-if="selectedLayer" class="mt-1 text-12px op70">
                {{ selectedLayer.label }}
              </div>
            </div>
          </div>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

<style scoped>
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}

.recording {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transition-duration: 1s;
  box-shadow: #ef4444 0 0 8px;
}
</style>

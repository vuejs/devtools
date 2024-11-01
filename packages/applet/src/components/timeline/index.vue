<script setup lang="ts">
import type { CustomInspectorState, TimelineEventOptions } from '@vue/devtools-kit'
import { DevToolsMessagingEvents, rpc, useDevToolsState } from '@vue/devtools-core'
import { parse } from '@vue/devtools-kit'
import { vTooltip, VueIcIcon } from '@vue/devtools-ui'

import { Pane, Splitpanes } from 'splitpanes'
import { computed, onUnmounted, ref } from 'vue'
import DevToolsHeader from '~/components/basic/DevToolsHeader.vue'
import Empty from '~/components/basic/Empty.vue'
import Navbar from '~/components/basic/Navbar.vue'
import RootStateViewer from '~/components/state/RootStateViewer.vue'
import { createExpandedContext } from '~/composables/toggle-expanded'
import EventList from './EventList.vue'

const props = withDefaults(defineProps<{
  layerIds: string[]
  pluginId: string
  docLink: string
  githubRepoLink?: string
  headerVisible?: boolean
  switcherVisible?: boolean
}>(), {
  headerVisible: true,
  switcherVisible: true,
})

const { expanded: expandedStateNodes } = createExpandedContext('timeline-state')

// event info + group info = [0, 1]
expandedStateNodes.value = ['0', '1']

const eventList = ref<TimelineEventOptions['event'][]>([])
const groupList = ref<Map<string | number | undefined, TimelineEventOptions['event'][]>>(new Map())
const selectedEventIndex = ref(0)
const devtoolsState = useDevToolsState()
const recordingState = computed(() => devtoolsState.timelineLayersState.value?.[props.pluginId])
const selectedEventInfo = computed(() => eventList.value[selectedEventIndex.value] ?? null)
const recordingTooltip = computed(() => recordingState.value ? 'Stop recording' : 'Start recording')
// event info
const normalizedEventInfo = computed(() => {
  const info: CustomInspectorState[] = []
  for (const key in selectedEventInfo.value?.data) {
    info.push({
      key,
      type: key,
      editable: false,
      value: selectedEventInfo.value.data[key]!,
    } as unknown as CustomInspectorState)
  }
  return info
})
// group info
const normalizedGroupInfo = computed(() => {
  const groupId = selectedEventInfo.value?.groupId
  const groupInfo = groupList.value.get(groupId)!
  if (groupInfo) {
    const duration = groupInfo[groupInfo.length - 1]?.time - (groupInfo[0]?.time ?? 0)
    return [{
      key: 'events',
      type: 'events',
      editable: false,
      value: groupInfo.length,
    }, duration && {
      key: 'duration',
      type: 'duration',
      editable: false,
      value: `${duration}ms`,
    }].filter(Boolean)
  }
  return undefined
})

// normalize display info
const displayedInfo = computed(() => {
  return { 'Event Info': normalizedEventInfo.value, ...(normalizedGroupInfo.value && { 'Group Info': normalizedGroupInfo.value }) } as unknown as Record<string, CustomInspectorState[]>
})

function normalizeGroupList(event: TimelineEventOptions['event']) {
  const groupId = event.groupId
  if (groupId !== undefined) {
    groupList.value.set(groupId, groupList.value.get(groupId) ?? [])
    groupList.value.get(groupId)?.push(event)
  }
}

function onTimelineEventUpdated(_payload) {
  const payload = parse(_payload)
  if (!payload)
    return

  const { layerId, event } = payload
  if (!props.layerIds.includes(layerId))
    return

  eventList.value.push(event)
  normalizeGroupList(event)
}

rpc.functions.on(DevToolsMessagingEvents.TIMELINE_EVENT_UPDATED, onTimelineEventUpdated)

onUnmounted(() => {
  rpc.functions.off(DevToolsMessagingEvents.TIMELINE_EVENT_UPDATED, onTimelineEventUpdated)
})

function clear() {
  eventList.value = []
  groupList.value.clear()
}

defineExpose({
  clear,
})

function toggleRecordingState() {
  rpc.value.updateTimelineLayersState({
    [props.pluginId]: !recordingState.value,
  })
}
</script>

<template>
  <div class="relative h-full flex flex-col">
    <DevToolsHeader v-if="headerVisible" :doc-link="docLink" :github-repo-link="githubRepoLink">
      <Navbar />
    </DevToolsHeader>

    <template v-if="eventList.length">
      <div class="flex-1 overflow-hidden">
        <Splitpanes class="h-full">
          <Pane border="r base" size="40" h-full>
            <div h-full select-none overflow-scroll class="no-scrollbar">
              <EventList v-model="selectedEventIndex" :data="eventList" />
            </div>
          </Pane>
          <Pane size="60">
            <div h-full overflow-scroll class="no-scrollbar">
              <RootStateViewer class="p3" :data="displayedInfo" node-id="" inspector-id="" :disable-edit="true" expanded-state-id="timeline-state" />
            </div>
          </Pane>
        </Splitpanes>
      </div>
    </template>
    <Empty v-else class="flex-1">
      No events
    </Empty>

    <div v-if="switcherVisible" class="absolute right-3 top-12 flex items-center justify-end b-1 border-base rounded-1 b-solid px2 py1">
      <div class="flex items-center gap-2 px-1">
        <div v-tooltip.bottom-end="{ content: recordingTooltip }" class="flex items-center gap1" @click="toggleRecordingState">
          <span v-if="recordingState" class="recording recording-btn bg-[#ef4444]" />
          <span v-else class="recording-btn bg-black op70 dark:(bg-white) hover:op100" />
        </div>
        <div v-tooltip.bottom-end="{ content: 'Clear all timelines' }" class="flex items-center gap1" @click="clear">
          <VueIcIcon name="baseline-delete" cursor-pointer text-xl op70 hover:op100 />
        </div>
        <div v-tooltip.bottom-end="{ content: '<p style=\'width: 285px\'>Timeline events can cause significant performance overhead in large applications, so we recommend enabling it only when needed and on-demand. </p>', html: true }" class="flex items-center gap1">
          <VueIcIcon name="baseline-tips-and-updates" cursor-pointer text-xl op70 hover:op100 />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
.recording-btn {
  --at-apply: w-3.5 h-3.5 inline-flex cursor-pointer rounded-50%;
}
.recording {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transition-duration: 1s;
  box-shadow: #ef4444 0 0 8px;
}
</style>

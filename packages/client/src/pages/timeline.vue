<script setup lang="ts">
import { SelectiveList, Timeline } from '@vue/devtools-applet'
import {
  rpc,
  useDevToolsState,
} from '@vue/devtools-core'
import { Pane, Splitpanes } from 'splitpanes'

const timelineRef = ref()

// responsive layout
const splitpanesRef = ref<HTMLDivElement>()
const splitpanesReady = ref(false)
const { width: splitpanesWidth } = useElementSize(splitpanesRef)
// prevent `Splitpanes` layout from being changed before it ready
const horizontal = computed(() => splitpanesReady.value ? splitpanesWidth.value < 700 : false)

// #region toggle app
const devtoolsState = useDevToolsState()
const appRecords = computed(() => devtoolsState.appRecords.value.map(app => ({
  label: app.name + (app.version ? ` (${app.version})` : ''),
  value: app.id,
})))

const normalizedAppRecords = computed(() => appRecords.value.map(app => ({
  label: app.label,
  id: app.value,
})))

const activeAppRecordId = ref(devtoolsState.activeAppRecordId.value)
watchEffect(() => {
  activeAppRecordId.value = devtoolsState.activeAppRecordId.value
})

function toggleApp(id: string) {
  rpc.value.toggleApp(id).then(() => {
    clearTimelineEvents()
  })
}

// #endregion
const activeTimelineLayer = ref('')
const timelineLayers = [
  {
    label: 'Mouse',
    id: 'mouse',
  },
  {
    label: 'Keyboard',
    id: 'keyboard',
  },
  {
    label: 'Component events',
    id: 'component-event',
  },
  {
    label: 'Performance',
    id: 'performance',
  },
]

function clearTimelineEvents() {
  timelineRef.value?.clear()
}

function toggleTimelineLayer() {
  clearTimelineEvents()
}
</script>

<template>
  <div class="h-full w-full">
    <Splitpanes ref="splitpanesRef" class="flex-1 overflow-auto" :horizontal="horizontal" @ready="splitpanesReady = true">
      <Pane v-if="appRecords.length > 1" border="base h-full" size="20">
        <div class="no-scrollbar h-full flex select-none gap-2 overflow-scroll">
          <SelectiveList v-model="activeAppRecordId" :data="normalizedAppRecords" class="w-full" @select="toggleApp" />
        </div>
      </Pane>
      <Pane border="base" h-full>
        <div class="h-full flex flex-col">
          <div class="no-scrollbar h-full flex select-none gap-2 overflow-scroll">
            <TimelineLayers v-model="activeTimelineLayer" :data="timelineLayers" class="w-full" @select="toggleTimelineLayer" @clear="clearTimelineEvents" />
          </div>
        </div>
      </Pane>
      <Pane relative h-full size="65">
        <div class="h-full flex flex-col p2">
          <Timeline ref="timelineRef" :layer-ids="[activeTimelineLayer]" :header-visible="false" doc-link="" plugin-id="" :switcher-visible="false" />
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

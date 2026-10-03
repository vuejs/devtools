<script setup lang="ts">
import type { DevtoolsExtensionFrameDescriptor } from '@vue/devtools-kit/client'
import { useDevtoolsClient } from '../../composables/devtools-client'

const { activeFrameId, apps, frames, selectApp, selectFrame, selectedAppId } = useDevtoolsClient()

function frameLabel(frame: DevtoolsExtensionFrameDescriptor): string {
  if (frame.main) return 'Top frame'
  if (!frame.url) return `Frame ${frame.frameId}`

  try {
    const url = new URL(frame.url)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return `Frame ${frame.frameId}`
  }
}
</script>

<template>
  <div class="no-scrollbar h-full min-h-0 select-none overflow-auto">
    <ul v-if="frames.length > 1" class="m-0 list-none border-b border-base p-2">
      <li v-for="frame in frames" :key="frame.frameId">
        <button
          class="selectable-item w-full border-0 bg-transparent color-inherit text-left font-[inherit]"
          :class="{ active: activeFrameId === frame.frameId }"
          type="button"
          :title="frame.url"
          :aria-pressed="activeFrameId === frame.frameId"
          @click="selectFrame(frame.frameId)"
        >
          <span class="min-w-0 truncate">
            {{ frameLabel(frame) }}
          </span>
        </button>
      </li>
    </ul>
    <ul class="m-0 list-none p-2">
      <li v-for="app in apps" :key="app.id">
        <button
          class="selectable-item w-full border-0 bg-transparent color-inherit text-left font-[inherit]"
          :class="{ active: selectedAppId === app.id }"
          type="button"
          :aria-pressed="selectedAppId === app.id"
          @click="selectApp(app.id)"
        >
          <span class="min-w-0 truncate">
            {{ app.name }}{{ app.version ? ` (${app.version})` : '' }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

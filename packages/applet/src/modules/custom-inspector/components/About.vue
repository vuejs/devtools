<script setup lang="ts">
import { ref } from 'vue'
import { useCustomInspectorState } from '~/composables/custom-inspector-state'
import { useVirtualRouter } from '~/composables/virtual-router'
import DevToolsLogo from './DevToolsLogo.vue'

const virtualRouter = useVirtualRouter()
const state = useCustomInspectorState()
const imageLoaded = ref(false)
const imageLoadedError = ref(false)
function onImageLoad() {
  imageLoaded.value = true
}
function onImageLoadError() {
  imageLoaded.value = true
  imageLoadedError.value = true
}
</script>

<template>
  <div h-full w-full flex items-center>
    <div flex="~ col gap2" ma px-5>
      <div flex-auto />
      <!-- Banner -->
      <div flex="~ col" mt-20 items-center>
        <div flex="~" mt--10 items-center justify-center>
          <span class="mr-1">
            <span v-if="!imageLoaded" class="inline-block w20" />
            <img v-show="imageLoaded && !imageLoadedError" :src="state.logo" :alt="`${state.label} Logo`" class="inline-block h16" @error="onImageLoadError" @load="onImageLoad">
            <span v-if="imageLoadedError" class="mr2 inline-block min-w-20 text-center text-10 font-600">{{ state.label }}</span>
          </span>
          <span>
            <DevToolsLogo h-18 />
          </span>
        </div>
        <div mb6 mt--1 text-center text-sm flex="~ gap-1">
          <span op40>
            {{ state.label }} DevTools
          </span>
        </div>
      </div>

      <div flex-auto />

      <div flex="~ gap2 wrap">
        <div flex="~ col auto" min-w-40 p4 theme-card-lime @click="virtualRouter.push('/state')">
          <div i-carbon-tree-view-alt text-3xl />
          <code>State</code>
        </div>
        <div v-if="state.timelineLayerIds?.length" flex="~ col auto" min-w-40 p4 theme-card-lime @click="virtualRouter.push('/timeline')">
          <div i-mdi:timeline-clock-outline text-3xl />
          <div>Timeline</div>
        </div>
      </div>

      <div flex="~ gap-6 wrap" mt-5 items-center justify-center>
        <a :href="state.homepage" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-yellow" transition>
          <div i-carbon-document />
          View Documentation
        </a>
      </div>

      <div flex-auto />
    </div>
  </div>
</template>

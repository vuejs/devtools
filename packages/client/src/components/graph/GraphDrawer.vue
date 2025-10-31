<script setup lang="ts">
import { useDevToolsState } from '@vue/devtools-core'
import { showVueNotification, VueButton, VueDrawer } from '@vue/devtools-ui'
import { openInEditor } from '../../composables/open-in-editor'

defineProps<{
  top?: HTMLElement
}>()

const data = graphDrawerData
const show = graphDrawerShow
const filterId = graphFilterNodeId
const state = useDevToolsState()

const _openInEditor = (path: string) => {
  if (state.vitePluginDetected.value && vueInspectorDetected.value) {
    openInEditor(path)
    return
  }
  copy(path)
}

const copiedDuring = 1500
const { copy: copyApi, isSupported, copied } = useClipboard({
  copiedDuring,
})

function copy(data: string) {
  copyApi(data)
  showVueNotification({
    message: 'Copied to clipboard',
    type: 'success',
    duration: copiedDuring,
  })
}

const keys = [
  ['refs', 'references'],
  ['deps', 'dependencies'],
] as const

// Pathfinding mode
const pathfindingMode = graphPathfindingMode
const pathfindingResults = graphPathfindingResults
const pathfindingStart = graphPathfindingStart
const pathfindingEnd = graphPathfindingEnd

function handleFilterToThisModule() {
  filterId.value = data.value!.path
  pathfindingMode.value = false
}
</script>

<template>
  <VueDrawer
    v-model="show"
    :top="top"
    :close-outside="false"
    :permanent="true"
    :content-blur="true"
    position="absolute"
    mount-to=".graph-body"
  >
    <div class="w-300px" h-full of-auto>
      <!-- Show Selected Node Info -->
      <template v-if="data">
        <div text-md h-80px border-b border-base p3 flex="~ col gap1">
          <span text-lg flex="~ gap2 items-center">
            {{ data?.name }}
            <span v-if="copied" i-material-symbols-check-small text-primary-500 />
            <span
              v-else-if="data"
              hover="op-100" i-carbon-copy cursor-pointer text-sm op-50 :class="{
                'text-gray-200': !isSupported,
              }" @click="copy(data.name)"
            />
          </span>
          <button hover="underline" truncate text-left text-gray-500 :title="data?.displayPath" @click="_openInEditor(data!.path)">
            {{ data?.displayPath }}
          </button>
        </div>
        <div
          v-for="([key, keyDisplay]) in keys" :key="key"
          max-h-60 of-auto border-b border-base p3 text-sm
        >
          <div pb2 text-gray-500>
            <span text-primary-500>{{ data?.[key].length }}</span>
            {{ keyDisplay }}
          </div>
          <div flex="~ col gap2 items-start">
            <button
              v-for="item in data?.[key]" :key="item.path" dark="text-gray-200"
              of-hidden truncate ws-nowrap pr-3 text-gray-800 hover="underline" @click="_openInEditor(item.path)"
            >
              {{ item.displayPath }}
            </button>
          </div>
        </div>
        <div p3>
          <VueButton type="primary" @click="handleFilterToThisModule">
            Filter to this module
          </VueButton>
        </div>
      </template>

      <!-- Show Found Paths -->
      <template v-if="pathfindingMode && pathfindingStart && pathfindingEnd">
        <div v-if="data" border-b border-base p3 />

        <div text-md h-auto border-b border-base p3 flex="~ col gap2">
          <span text-lg font-bold>Path Results</span>
          <div text-sm text-gray-500>
            <span text-primary-500>{{ pathfindingResults.length }}</span>
            {{ pathfindingResults.length === 1 ? 'path' : 'paths' }} found
          </div>
          <div text-xs text-gray-400>
            From: {{ pathfindingStart }}
          </div>
          <div text-xs text-gray-400>
            To: {{ pathfindingEnd }}
          </div>
        </div>

        <div v-if="pathfindingResults.length === 0" p3 text-sm text-gray-500>
          <div mb2>
            No paths found between these modules.
          </div>
          <div text-xs>
            Tip: Try using partial file names like "App.vue" or "main.ts"
          </div>
        </div>

        <div
          v-for="(pathInfo, index) in pathfindingResults"
          :key="index"
          border-b border-base p3 text-sm
        >
          <div pb2 text-gray-500 font-bold>
            Path {{ index + 1 }}
            <span text-xs>({{ pathInfo.path.length }} steps)</span>
          </div>
          <div flex="~ col gap1">
            <div
              v-for="(nodeName, nodeIndex) in pathInfo.displayPath"
              :key="nodeIndex"
              flex="~ items-center gap-2"
            >
              <div
                h-4px w-4px rounded-full
                :class="[
                  nodeIndex === 0 ? 'bg-green-500'
                  : nodeIndex === pathInfo.displayPath.length - 1 ? 'bg-red-500'
                    : 'bg-orange-500',
                ]"
              />
              <button
                truncate text-left hover="underline"
                :class="[
                  nodeIndex === 0 ? 'text-green-600 dark:text-green-400 font-bold'
                  : nodeIndex === pathInfo.displayPath.length - 1 ? 'text-red-600 dark:text-red-400 font-bold'
                    : 'text-gray-800 dark:text-gray-200',
                ]"
                :title="pathInfo.path[nodeIndex]"
                @click="_openInEditor(pathInfo.path[nodeIndex])"
              >
                {{ nodeName }}
              </button>
              <div
                v-if="nodeIndex < pathInfo.displayPath.length - 1"
                i-carbon-arrow-down text-xs op50
              />
            </div>
          </div>
        </div>
      </template>
    </div>
  </VueDrawer>
</template>

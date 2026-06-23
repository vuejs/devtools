<script setup lang="ts">
import { VueCheckbox, VueInput } from '@vue/devtools-ui'

const text = graphSearchText
const settings = graphSettings

// ['key', 'label']
const selectableItems = [
  ['node_modules'],
  ['virtual', 'virtual module'],
  ['lib', 'library module'],
] as const

const filterId = graphFilterNodeId

// Pathfinding mode
const pathfindingMode = graphPathfindingMode
const pathfindingStart = graphPathfindingStart
const pathfindingEnd = graphPathfindingEnd
const nodesCount = graphNodeCount
const edgesCount = graphEdgeCount

function togglePathfindingMode() {
  pathfindingMode.value = !pathfindingMode.value
  if (!pathfindingStart.value && text.value) {
    pathfindingStart.value = text.value
  }
}

function swapStartAndEnd() {
  const start = pathfindingStart.value
  pathfindingStart.value = pathfindingEnd.value
  pathfindingEnd.value = start
}
</script>

<template>
  <div flex="~ items-center gap-4 nowrap" class="[&_>*]:flex-[0_0_auto]" absolute left-0 top-0 z-10 navbar-base w-full overflow-x-auto glass-effect px4 text-sm>
    <!-- Toggle Pathfinding Mode Button -->
    <button
      rounded-full px3 py1 text-xs hover:op100
      :class="pathfindingMode ? 'bg-primary-500 text-white op100' : 'bg-gray:20 op50'"
      @click="togglePathfindingMode"
    >
      <div flex="~ items-center gap-1">
        <div i-carbon-tree-view-alt />
        <span>Pathfinding</span>
      </div>
    </button>

    <!-- Pathfinding Mode Inputs -->
    <template v-if="pathfindingMode">
      <VueInput v-model="pathfindingStart" placeholder="Start module..." />
      <button i-carbon-arrow-right rounded-full op50 hover:text-primary-500 hover:op100 @click="swapStartAndEnd" />
      <VueInput v-model="pathfindingEnd" placeholder="End module..." />
    </template>

    <!-- Normal Search Mode Input -->
    <VueInput v-else v-model="text" placeholder="Search modules..." />

    <div v-for="item in selectableItems" :key="item[0]" flex="~ gap-2 items-center">
      <VueCheckbox v-model="settings[item[0]]" />
      <span :class="{ 'text-gray-400 dark:text-gray-600': !settings[item[0]] }">Show {{ item[1] ?? item[0] }}</span>
    </div>
    <div flex-auto />
    <div>
      nodes: {{ nodesCount }} | edges: {{ edgesCount }}
    </div>
    <button v-if="!pathfindingMode && filterId" rounded-full bg-gray:20 py1 pl3 pr2 text-xs op50 hover:op100 @click="filterId = ''">
      Clear filter
      <div i-carbon-close mb2px />
    </button>
  </div>
</template>

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
</script>

<template>
  <div flex="~ items-center gap-4 nowrap" class="[&_>*]:flex-[0_0_auto]" absolute left-0 top-0 z-10 navbar-base w-full overflow-x-auto glass-effect px4 text-sm>
    <VueInput v-model="text" placeholder="Search modules..." />
    <div v-for="item in selectableItems" :key="item[0]" flex="~ gap-2 items-center">
      <VueCheckbox v-model="settings[item[0]]" />
      <span :class="{ 'text-gray-400 dark:text-gray-600': !settings[item[0]] }">Show {{ item[1] ?? item[0] }}</span>
    </div>
    <div flex-auto />
    <button v-if="filterId" rounded-full bg-gray:20 py1 pl3 pr2 text-xs op50 hover:op100 @click="filterId = ''">
      Clear filter
      <div i-carbon-close mb2px />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CustomInspectorState } from '@vue/devtools-kit'
import StateFieldViewer from './StateFieldViewer.vue'

withDefaults(defineProps<{
  data: CustomInspectorState[]
  depth?: number
  index: string
  expandedStateId?: string
}>(), {
  depth: 0,
  expandedStateId: '',
})
</script>

<template>
  <div>
    <div
      v-for="(item, i) in data"
      :key="i"
    >
      <StateFieldViewer :data="item" :depth="depth + 1" :index="`${index}-${i}`" :expanded-state-id="expandedStateId" />
    </div>
  </div>
</template>

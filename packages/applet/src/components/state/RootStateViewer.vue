<script setup lang="ts">
import type { CustomInspectorState } from '@vue/devtools-kit'
import { watchEffect } from 'vue'
import ToggleExpanded from '~/components/basic/ToggleExpanded.vue'
import { createStateEditorContext } from '~/composables/state-editor'
import { useToggleExpanded } from '~/composables/toggle-expanded'
import ChildStateViewer from './ChildStateViewer.vue'

const props = withDefaults(defineProps<{
  data: Record<string, CustomInspectorState[]>
  nodeId: string
  inspectorId: string
  disableEdit?: boolean
  expandedStateId?: string
}>(), {
  disableEdit: false,
  expandedStateId: '',
})

function initEditorContext() {
  return {
    nodeId: props.nodeId,
    inspectorId: props.inspectorId,
    disableEdit: props.disableEdit,
  }
}

const { context } = createStateEditorContext(initEditorContext())
watchEffect(() => {
  context.value = initEditorContext()
})

const { expanded, toggleExpanded } = useToggleExpanded(props.expandedStateId)
</script>

<template>
  <div>
    <div
      v-for="(item, key, index) in data"
      :key="index"
    >
      <div
        class="flex items-center"
        :class="[item?.length && 'cursor-pointer hover:(bg-active)']"
        @click="toggleExpanded(`${index}`)"
      >
        <ToggleExpanded
          v-if="item?.length"
          :value="expanded.includes(`${index}`)"
        />
        <!-- placeholder -->
        <span v-else pl5 />
        <span font-state-field text-3.5 text-hex-a3a3a3>
          {{ key }}
        </span>
      </div>
      <div
        v-if="item?.length && expanded.includes(`${index}`)"
      >
        <ChildStateViewer :data="item" :index="`${index}`" :expanded-state-id="expandedStateId" />
      </div>
    </div>
  </div>
</template>

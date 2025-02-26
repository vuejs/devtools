<script setup lang="ts">
import type { ComponentTreeNode, InspectorTree } from '@vue/devtools-kit'
import { UNDEFINED } from '@vue/devtools-kit'
import { vTooltip } from '@vue/devtools-ui'
import NodeTag from '~/components/basic/NodeTag.vue'
import ToggleExpanded from '~/components/basic/ToggleExpanded.vue'
import ComponentTreeViewer from '~/components/tree/TreeViewer.vue'
import { useSelect } from '~/composables/select'
import { useToggleExpanded } from '~/composables/toggle-expanded'

const props = withDefaults(defineProps<{
  data: ComponentTreeNode[] | InspectorTree[]
  depth: number
  withTag: boolean
}>(), {
  depth: 0,
  withTag: false,
})
const emit = defineEmits(['hover', 'leave'])
const selectedNodeId = defineModel()
const { expanded, toggleExpanded } = useToggleExpanded()
const { select: _select } = useSelect()

function normalizeLabel(item: ComponentTreeNode | InspectorTree) {
  return ('name' in item && item?.name) || ('label' in item && item.label)
}

function select(id: string) {
  selectedNodeId.value = id
}
</script>

<template>
  <div
    v-for="(item, index) in data"
    :key="index"
    :class="{
      'min-w-max': depth === 0,
    }"
  >
    <div
      class="group flex cursor-pointer items-center rounded-1 hover:(bg-primary-300 dark:bg-gray-600)"
      :style=" { paddingLeft: `${15 * depth + 4}px` }"
      :class="{ 'bg-primary-600! active': selectedNodeId === item.id }"
      @click="select(item.id)"
      @dblclick="toggleExpanded(item.id)"
      @mouseover="() => emit('hover', item.id)"
      @mouseleave="() => emit('leave')"
    >
      <ToggleExpanded
        v-if="item?.children?.length"
        :value="expanded.includes(item.id)"
        class="[.active_&]:op20 group-hover:op20"
        @click.stop="toggleExpanded(item.id)"
      />
      <!-- placeholder -->
      <span v-else pl5 />
      <span font-state-field text-3.5>
        <span v-if="withTag" class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) [.active_&]:(op50 text-white!)">&lt;</span>
        <span group-hover:text-white class="ws-nowrap [.active_&]:(text-white)">{{ normalizeLabel(item) }}</span>
        <!-- @vue-expect-error skip type check -->
        <span
          v-if="(item.renderKey === 0 || !!item.renderKey) && item.renderKey !== UNDEFINED"
          class="text-xs opacity-50"
          :class="{
            'opacity-100': selectedNodeId === item.id,
          }"
        >
          <span :class="[selectedNodeId === item.id ? 'text-purple-200' : 'text-purple-500']"> key</span>=<span>{{ (item as ComponentTreeNode).renderKey }}</span>
        </span>
        <span v-if="withTag" class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) [.active_&]:(op50 text-white!)">&gt;</span>
      </span>
      <span
        v-if="(item as ComponentTreeNode).isFragment"
        v-tooltip="'Has multiple root DOM nodes'"
        class="ml-2 rounded-sm bg-blue-400 px-1 text-[0.75rem] leading-snug dark:bg-blue-800"
      >
        fragment
      </span>
      <span
        v-if="(item as ComponentTreeNode).inactive"
        v-tooltip="'Currently inactive but not destroyed'"
        class="ml-2 rounded-sm bg-gray-500 px-1 text-[0.75rem] leading-snug"
      >
        inactive
      </span>
      <NodeTag v-for="(_item, _index) in item.tags" :key="_index" :tag="_item" />
    </div>
    <div
      v-if="item?.children?.length && expanded.includes(item.id)"
    >
      <ComponentTreeViewer
        v-model="selectedNodeId" :data="item?.children" :depth="depth + 1" :with-tag="withTag" @hover="(id) => emit('hover', id)" @leave="emit('leave')"
      />
    </div>
  </div>
</template>

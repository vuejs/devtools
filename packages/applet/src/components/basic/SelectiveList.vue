<script setup lang="ts">
import type { CustomInspectorNode } from '@vue/devtools-kit'
import { defineModel } from 'vue'
import NodeTag from '~/components/basic/NodeTag.vue'

defineProps<{ data: CustomInspectorNode[] }>()

const emit = defineEmits(['select'])
const selected = defineModel()
function select(id: string) {
  selected.value = id
  emit('select', id)
}
</script>

<template>
  <ul class="p2">
    <li
      v-for="item in data" :key="item.id"
      class="selectable-item"
      :class="{ active: item.id === selected }"
      @click="select(item.id)"
    >
      {{ item.label }}
      <NodeTag v-for="(_item, index) in item.tags" :key="index" :tag="_item" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { CustomInspectorState } from '@vue/devtools-kit'

const props = defineProps<{
  state: CustomInspectorState[]
}>()

const emit = defineEmits(['close'])

function close() {
  emit('close')
}
console.log(props.state)
</script>

<template>
  {{ state }}
  <div class="absolute left-0 top-0 h-full w-full flex flex-col rounded-br-2.5 rounded-tr-2.5 bg-white p2 dark:bg-#121212">
    <div class="h-12 w-full flex items-center justify-between p-2">
      <span class="font-500">Reactivity Relationships</span>
      <i class="i-carbon-close cursor-pointer hover:op80" @click="close" />
    </div>
    <div class="flex-1 overflow-scroll text-3.5">
      Hi
    </div>
  </div>
</template>

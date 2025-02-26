<script setup lang="ts">
import { VueCodeBlock } from '@vue/devtools-ui'

defineProps<{
  code: string
}>()

const emit = defineEmits(['close'])

function close() {
  emit('close')
}
</script>

<template>
  <div class="absolute left-0 top-0 h-full w-full flex flex-col rounded-br-2.5 rounded-tr-2.5 bg-white p2 dark:bg-[#121212]">
    <div class="h-12 w-full flex items-center justify-between p-2">
      <span class="font-500">Render Code</span>
      <i class="i-carbon-close cursor-pointer hover:op80" @click="close" />
    </div>
    <div class="flex-1 overflow-scroll text-3.5">
      <VueCodeBlock :code="code" lang="javascript" />
    </div>
  </div>
</template>

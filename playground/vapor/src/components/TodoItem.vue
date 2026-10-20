<script setup vapor lang="ts">
defineProps<{
  todo: { id: number; text: string; done: boolean }
}>()

defineEmits<{
  toggle: []
  remove: []
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <input type="checkbox" :checked="todo.done" @change="$emit('toggle')" />
    <span>{{ todo.text }}</span>
    <button class="btn-action-sm" @click="$emit('remove')">x</button>
  </div>
</template>

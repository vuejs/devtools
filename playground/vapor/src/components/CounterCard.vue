<script setup vapor lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  label: string
  step: number
}>()

const emit = defineEmits<{
  change: [value: number]
}>()

const count = ref(0)
const doubled = computed(() => count.value * 2)

function increment() {
  count.value += props.step
  emit('change', count.value)
}
</script>

<template>
  <div class="card">
    <h3 class="card-title">{{ label }}</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="increment">+{{ step }}</button>
      <span>count: {{ count }}</span>
      <span class="text-xs color-muted">doubled: {{ doubled }}</span>
    </div>
  </div>
</template>

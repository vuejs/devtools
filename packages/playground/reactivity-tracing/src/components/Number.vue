<script setup lang="ts">
const props = defineProps<{ num: number }>()

const db = computed(() => {
  return props.num * 2
})
</script>

<template>
  <span>
    {{ num }}
    {{ db }}
  </span>
</template>

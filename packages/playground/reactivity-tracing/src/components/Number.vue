<script setup lang="ts">
const props = defineProps<{ num: number }>()

const doubleNum = computed(() => {
  return props.num * 2
})
</script>

<template>
  <span>
    {{ num }}
    {{ doubleNum }}
  </span>
</template>

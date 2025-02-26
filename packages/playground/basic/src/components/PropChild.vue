<script setup lang="ts">
const props = defineProps<{
  bool: boolean
  num: number
  str: string
  obj: Record<string, any>
}>()
</script>

<template>
  <div>
    <div>bool: {{ props.bool }}</div>
    <div>num: {{ props.num }}</div>
    <div>str: {{ props.str }}</div>
    <div>obj: {{ props.obj }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  detail: string
}>()
</script>

<template>
  <article class="metric-tile">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small>{{ detail }}</small>
  </article>
</template>

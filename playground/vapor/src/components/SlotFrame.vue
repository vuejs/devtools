<script setup vapor lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="card">
    <h3 class="card-title">{{ title }}</h3>
    <slot />
    <div class="text-xs color-muted">
      <slot name="footer" />
    </div>
  </div>
</template>

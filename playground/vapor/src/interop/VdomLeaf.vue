<script setup lang="ts">
defineProps<{
  count: number
}>()
</script>

<template>
  <div class="card">
    <h3 class="card-title">VDOM grandchild under Vapor</h3>
    <span class="text-xs color-muted">received count: {{ count }}</span>
  </div>
</template>

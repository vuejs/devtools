<script setup lang="ts">
defineProps<{ index: number; activeTrack: string }>()
</script>

<template>
  <article class="render-node">
    <span>Node {{ index }}</span>
    <strong>{{ activeTrack }}</strong>
    <small>branch {{ index % 12 }}</small>
  </article>
</template>

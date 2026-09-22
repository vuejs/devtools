<script setup lang="ts">
import RenderNode from './RenderNode.vue'
defineProps<{
  count: number
  activeTrack: string
}>()
</script>

<template>
  <section class="render-cluster">
    <RenderNode v-for="index in count" :key="index" :index="index" :active-track="activeTrack" />
  </section>
</template>

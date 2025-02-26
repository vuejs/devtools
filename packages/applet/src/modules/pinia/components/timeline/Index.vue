<script setup lang="ts">
import Timeline from '~/components/timeline/index.vue'

const pluginDescriptorId = 'dev.esm.pinia'
const LAYER_IDS = ['pinia:mutations']
</script>

<template>
  <Timeline :layer-ids="LAYER_IDS" doc-link="https://pinia.vuejs.org/" :plugin-id="pluginDescriptorId" github-repo-link="https://github.com/vuejs/pinia" />
</template>

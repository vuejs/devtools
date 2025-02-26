<script setup lang="ts">
import Timeline from '~/components/timeline/index.vue'
import { useCustomInspectorState } from '~/composables/custom-inspector-state'

const pluginDescriptorId = 'org.vuejs.router'
const state = useCustomInspectorState()
</script>

<template>
  <Timeline :layer-ids="state.timelineLayerIds!" doc-link="https://router.vuejs.org/" :plugin-id="pluginDescriptorId" github-repo-link="https://github.com/vuejs/router" />
</template>

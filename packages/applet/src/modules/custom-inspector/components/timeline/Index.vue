<script setup lang="ts">
import Timeline from '~/components/timeline/index.vue'
import { useCustomInspectorState } from '~/composables/custom-inspector-state'

const state = useCustomInspectorState()
</script>

<template>
  <Timeline :layer-ids="state.timelineLayerIds!" :doc-link="state.homepage!" :plugin-id="state.pluginId!" />
</template>

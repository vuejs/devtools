<script setup lang="ts">
import DevtoolsIcon from '../common/DevtoolsIcon.vue'

defineProps<{
  icon: string
}>()
</script>

<template>
  <DevtoolsIcon class="tab-icon" :icon="icon" fallback="i-carbon-bring-forward" />
</template>

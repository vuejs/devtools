<script setup lang="ts">
import type { DevtoolsTab } from '../../types/tab'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import TabIcon from './TabIcon.vue'

const props = defineProps<{
  tab: DevtoolsTab
  active: boolean
  expanded?: boolean
}>()

const tooltip = computed(() => ({
  content: props.tab.title,
  disabled: props.expanded,
}))
const tabPath = computed(() => props.tab.path ?? `/${props.tab.id}`)
</script>

<template>
  <RouterLink v-slot="{ href, navigate }" :to="tabPath" custom>
    <a
      v-tooltip.right="tooltip"
      class="side-nav-item no-underline"
      :class="{
        'side-nav-item-active': active,
        'side-nav-item-expanded': expanded,
      }"
      :href="href"
      :aria-label="tab.title"
      :aria-current="active ? 'page' : undefined"
      @click="navigate"
    >
      <TabIcon :icon="tab.icon" />
      <span v-if="expanded" class="min-w-0 truncate text-3.5 font-500">
        {{ tab.title }}
      </span>
    </a>
  </RouterLink>
</template>

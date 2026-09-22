<script setup lang="ts">
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import { computed, ref, watch } from 'vue'

interface TimelineEntry {
  id: number
  label: string
  detail: string
}

const props = defineProps<{
  selectedPlan: string
  status: string
  timeline: TimelineEntry[]
}>()

const lastEventLabel = ref('waiting')
const visibleTimeline = computed(() => props.timeline.slice(0, 3))
const activityCount = computed(() => props.timeline.length)

watch(
  () => props.timeline[0]?.id,
  () => {
    lastEventLabel.value = props.timeline[0]?.label ?? 'waiting'
  },
  { immediate: true },
)
</script>

<template>
  <LayoutCard class="grid h-full content-start gap-4" elevated>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="panel-heading">Activity</h2>
        <p class="mt-1 truncate panel-subtitle">{{ lastEventLabel }}</p>
      </div>
      <DisplayNumberBadge :value="activityCount" :color="false" />
    </div>

    <ol
      v-if="visibleTimeline.length"
      class="m-0 grid list-none gap-1 border-t border-base pt-3 p-0"
    >
      <li
        v-for="item in visibleTimeline"
        :key="item.id"
        class="grid gap-0.5 rounded-md px-2 py-2 transition hover:bg-hover"
      >
        <strong class="text-xs color-base font-500">{{ item.label }}</strong>
        <span class="text-xs color-muted font-mono">{{ item.detail }}</span>
      </li>
    </ol>

    <FeedbackEmptyState v-else icon="i-ph:activity" title="No activity">
      <template #hint>{{ selectedPlan }} quote is {{ status }}.</template>
    </FeedbackEmptyState>
  </LayoutCard>
</template>

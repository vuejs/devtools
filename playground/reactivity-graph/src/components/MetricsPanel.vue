<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import DisplayNumber from '@antfu/design/components/Display/DisplayNumber.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import { computed, ref, watch } from 'vue'

interface MetricRow {
  label: string
  value: string
}

const props = defineProps<{
  metrics: MetricRow[]
  status: string
  stock: number
}>()

const stockMessage = ref('')
const stockSeverity = computed(() => {
  if (props.stock >= 10) return 'green'
  if (props.stock >= 4) return 'amber'
  return 'red'
})

watch(
  () => props.stock,
  (value, previous) => {
    stockMessage.value =
      previous == null ? `Initial stock ${value}` : `Stock ${previous} → ${value}`
  },
  { immediate: true },
)
</script>

<template>
  <LayoutCard class="grid h-full content-start gap-4" elevated>
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="panel-heading">Derived metrics</h2>
        <p class="mt-1 panel-subtitle">Computed from the current quote.</p>
      </div>
      <DisplayBadge :color="stockSeverity" rounded="full" class="text-xs">
        <DisplayNumber :value="stock" /> in stock
      </DisplayBadge>
    </div>

    <div class="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-base pt-4">
      <DisplayKeyValue
        v-for="metric in metrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
      />
    </div>

    <p class="text-xs color-faint font-mono">{{ stockMessage }} · {{ status }}</p>
  </LayoutCard>
</template>

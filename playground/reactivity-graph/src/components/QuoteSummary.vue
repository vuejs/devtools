<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  activeCustomerLabel: string
  analyticsPreview: string
  basePrice: number
  discount: number
  renderPreview: string
  seats: number
  selectedPlanPrice: number
  status: string
  statusSummary: string
  total: number
  totalDisplay: string
}>()

const lastTotalDisplay = ref(props.totalDisplay)
const statusColor = computed(() => {
  if (props.status === 'ready') return 'green'
  if (props.status === 'review') return 'amber'
  return 'red'
})
const perSeatTotal = computed(() => (props.seats ? props.total / props.seats : props.total))
const priceRows = computed(() => [
  { label: 'Unit price', value: formatCurrency(props.selectedPlanPrice) },
  { label: 'Base', value: formatCurrency(props.basePrice) },
  { label: 'Discount', value: formatCurrency(props.discount) },
  { label: 'Total', value: props.totalDisplay },
])

watch(
  () => props.totalDisplay,
  (value) => {
    lastTotalDisplay.value = value
  },
  { immediate: true },
)

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}
</script>

<template>
  <LayoutCard elevated>
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-xs color-muted font-500">{{ activeCustomerLabel }}</p>
        <h2 class="mt-1 text-xl color-base font-600 leading-tight">{{ statusSummary }}</h2>
        <p class="mt-2 truncate text-xs color-muted font-mono">
          {{ renderPreview }} · {{ analyticsPreview }} · {{ formatCurrency(perSeatTotal) }}/seat
        </p>
      </div>
      <DisplayBadge :color="statusColor" rounded="full" class="text-xs uppercase">
        {{ status }}
      </DisplayBadge>
    </div>

    <div class="mt-5 grid grid-cols-4 divide-x divide-base border-t border-base pt-4">
      <DisplayKeyValue
        v-for="row in priceRows"
        :key="row.label"
        :label="row.label"
        :value="row.value"
        orientation="stacked"
        class="px-4 first:pl-0 last:pr-0"
      />
    </div>
  </LayoutCard>
</template>

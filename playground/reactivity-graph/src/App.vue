<script setup lang="ts">
import { provideColorScheme } from '@antfu/design/composables/colorScheme'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import DisplayVersion from '@antfu/design/components/Display/DisplayVersion.vue'
import { onMounted, version } from 'vue'
import ActivityFeed from './components/ActivityFeed.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import QuoteControls from './components/QuoteControls.vue'
import QuoteSummary from './components/QuoteSummary.vue'
import { useQuoteWorkspace } from './reactivity/lab'

provideColorScheme('dark')

const {
  activeCustomer,
  activeCustomerId,
  analyticsPreview,
  basePrice,
  couponCode,
  customerOptions,
  discount,
  metrics,
  order,
  planOptions,
  receiveStock,
  renderPreview,
  resetQuote,
  selectedPlan,
  selectedPlanRecord,
  setActiveCustomerId,
  setCouponCode,
  setRush,
  setSeats,
  setSelectedPlan,
  status,
  statusSummary,
  stockLeft,
  submitOrder,
  timeline,
  total,
  totalDisplay,
  tracer,
} = useQuoteWorkspace()

function updatePlan(value: string) {
  setSelectedPlan(value as Parameters<typeof setSelectedPlan>[0])
}

function updateCustomer(value: string) {
  setActiveCustomerId(value as Parameters<typeof setActiveCustomerId>[0])
}

function statusColor(value: string) {
  if (value === 'ready') return 'green'
  if (value === 'review') return 'amber'
  return 'red'
}

onMounted(() => {
  tracer.refresh()
})
</script>

<template>
  <main class="min-h-screen bg-secondary color-base">
    <header class="border-b border-base bg-base">
      <div class="mx-auto flex max-w-1280px items-center justify-between px-6 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-lg bg-active color-active">
            <span class="i-ph:graph-duotone text-xl" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-600 leading-tight">Reactivity Graph Lab</h1>
              <DisplayBadge :color="false" rounded="full">
                <DisplayVersion :version="version" />
              </DisplayBadge>
            </div>
            <p class="mt-0.5 text-xs color-muted">
              Trace quote inputs through computed state and render effects.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-5">
          <DisplayKeyValue label="Total" :value="totalDisplay" />
          <DisplayKeyValue label="Stock" :value="stockLeft" />
          <DisplayBadge :color="statusColor(status)" rounded="full" class="text-xs uppercase">
            {{ status }}
          </DisplayBadge>
        </div>
      </div>
    </header>

    <section class="mx-auto grid max-w-1280px gap-4 p-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside class="min-w-0">
        <QuoteControls
          :active-customer-id="activeCustomerId"
          :coupon-code="couponCode"
          :customer-options="customerOptions"
          :order="order"
          :plan-options="planOptions"
          :selected-plan="selectedPlan"
          @receive-stock="receiveStock"
          @reset="resetQuote"
          @submit="submitOrder"
          @update:active-customer-id="updateCustomer"
          @update:coupon-code="setCouponCode"
          @update:rush="setRush"
          @update:seats="setSeats"
          @update:selected-plan="updatePlan"
        />
      </aside>

      <section class="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
        <QuoteSummary
          :active-customer-label="activeCustomer.label"
          :analytics-preview="analyticsPreview"
          :base-price="basePrice"
          :discount="discount"
          :render-preview="renderPreview"
          :seats="order.seats"
          :selected-plan-price="selectedPlanRecord.price"
          :status="status"
          :status-summary="statusSummary"
          :total="total"
          :total-display="totalDisplay"
        />

        <section class="grid h-full items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <MetricsPanel :metrics="metrics" :status="status" :stock="selectedPlanRecord.stock" />

          <ActivityFeed :selected-plan="selectedPlan" :status="status" :timeline="timeline" />
        </section>
      </section>
    </section>
  </main>
</template>

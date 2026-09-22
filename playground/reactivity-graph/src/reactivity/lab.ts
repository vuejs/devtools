import { computed, onScopeDispose, reactive, ref } from 'vue'
import { createReactivityGraphTracer } from './relationship'

interface TimelineEntry {
  id: number
  label: string
  detail: string
}

interface PlanRecord {
  label: string
  price: number
  stock: number
}

type CustomerId = 'acme' | 'northstar'
type PlanKey = 'starter' | 'team'

const couponRates = {
  LAUNCH10: 0.1,
  NONE: 0,
} as const

export function useQuoteWorkspace() {
  const tracer = createReactivityGraphTracer()
  const timeline = ref<TimelineEntry[]>([])
  const statusSummary = ref('')
  const renderPreview = ref('')
  const analyticsPreview = ref('')

  const plans = reactive<Record<PlanKey, PlanRecord>>({
    starter: { label: 'Starter seats', price: 24, stock: 12 },
    team: { label: 'Team seats', price: 42, stock: 8 },
  })
  const customers = reactive({
    acme: { label: 'Acme Co', loyaltyCredit: 12 },
    northstar: { label: 'Northstar', loyaltyCredit: 4 },
  } satisfies Record<CustomerId, { label: string; loyaltyCredit: number }>)
  const order = reactive({
    rush: false,
    seats: 3,
  })

  const selectedPlan = tracer.traceRef<PlanKey>('selectedPlan', 'starter', 'plan selector')
  const activeCustomerId = tracer.traceRef<CustomerId>(
    'activeCustomerId',
    'acme',
    'customer selector',
  )
  const couponCode = tracer.traceRef('couponCode', 'LAUNCH10', 'coupon input')

  const activeCustomer = tracer.traceComputed(
    'activeCustomer',
    () => customers[activeCustomerId.value],
    'computed from activeCustomerId',
  )
  const selectedPlanRecord = tracer.traceComputed(
    'selectedPlanRecord',
    () => plans[selectedPlan.value],
    'computed from selectedPlan',
  )
  const basePrice = tracer.traceComputed(
    'basePrice',
    () => order.seats * selectedPlanRecord.value.price,
    'computed from seats and selected plan',
  )
  const couponRate = tracer.traceComputed(
    'couponRate',
    () => {
      const key = couponCode.value.trim().toUpperCase() as keyof typeof couponRates
      return couponRates[key] ?? couponRates.NONE
    },
    'computed from couponCode',
  )
  const discount = tracer.traceComputed(
    'discount',
    () => Math.round(basePrice.value * couponRate.value + activeCustomer.value.loyaltyCredit),
    'computed from price, coupon and customer credit',
  )
  const stockLeft = tracer.traceComputed(
    'stockLeft',
    () => selectedPlanRecord.value.stock - order.seats,
    'computed from selected plan stock and seats',
  )
  const status = tracer.traceComputed(
    'status',
    () => {
      if (stockLeft.value >= 0) return 'ready'
      return order.rush ? 'review' : 'blocked'
    },
    'computed from stockLeft and rush flag',
  )
  const total = tracer.traceComputed(
    'total',
    () => Math.max(0, basePrice.value - discount.value + (order.rush ? 18 : 0)),
    'computed from basePrice, discount and rush',
  )
  const totalDisplay = tracer.traceComputed(
    'totalDisplay',
    () => formatCurrency(total.value),
    'formatted total',
  )

  tracer.traceWatch('orderTotalWatch', total, (value, previous) => {
    pushTimeline('total updated', `${formatCurrency(previous ?? 0)} -> ${formatCurrency(value)}`)
  })
  tracer.traceWatch('statusWatch', status, (value, previous) => {
    if (value !== previous) pushTimeline('status changed', `${previous ?? '-'} -> ${value}`)
  })

  tracer.traceRender(
    'QuoteSummaryRender',
    () => {
      statusSummary.value = `${selectedPlanRecord.value.label}, ${order.seats} seats, ${status.value}`
    },
    'render effect for summary card',
  )
  tracer.traceRender(
    'OrderPreviewRender',
    () => {
      renderPreview.value = `${activeCustomer.value.label} pays ${totalDisplay.value}`
    },
    'render effect for preview row',
  )
  tracer.traceEffect(
    'AnalyticsEffect',
    () => {
      analyticsPreview.value = `${selectedPlan.value}:${status.value}:${Math.round(total.value)}`
    },
    'manual effect for analytics preview',
  )

  const metrics = tracer.traceComputed(
    'metrics',
    () => [
      { label: 'Base', value: formatCurrency(basePrice.value) },
      { label: 'Discount', value: formatCurrency(discount.value) },
      { label: 'Total', value: totalDisplay.value },
      { label: 'Stock left', value: stockLeft.value.toString() },
    ],
    'small dashboard metrics',
  )

  const workspaceCards = [
    {
      rows: [
        { label: 'Plan', value: computed(() => selectedPlanRecord.value.label) },
        { label: 'Status', value: status },
        { label: 'Total', value: totalDisplay },
      ],
      subtitle: 'Primary quote chain',
      title: 'Quote',
    },
    {
      rows: [
        { label: 'Customer', value: computed(() => activeCustomer.value.label) },
        { label: 'Coupon', value: couponCode },
        { label: 'Rush', value: computed(() => order.rush) },
      ],
      subtitle: 'Inputs feeding the graph',
      title: 'Inputs',
    },
  ]

  function setSelectedPlan(value: PlanKey) {
    selectedPlan.value = value
    tracer.scheduleRefresh()
  }

  function setActiveCustomerId(value: CustomerId) {
    activeCustomerId.value = value
    tracer.scheduleRefresh()
  }

  function setSeats(value: number) {
    order.seats = clamp(Math.round(value), 1, 16)
    tracer.scheduleRefresh()
  }

  function setRush(value: boolean) {
    order.rush = value
    tracer.scheduleRefresh()
  }

  function setCouponCode(value: string) {
    couponCode.value = value
    tracer.scheduleRefresh()
  }

  function receiveStock() {
    plans[selectedPlan.value].stock = clamp(plans[selectedPlan.value].stock + 3, 0, 30)
    pushTimeline('stock received', `${selectedPlan.value} stock ${plans[selectedPlan.value].stock}`)
    tracer.scheduleRefresh()
  }

  function submitOrder() {
    plans[selectedPlan.value].stock = clamp(plans[selectedPlan.value].stock - order.seats, 0, 30)
    pushTimeline('order submitted', `${order.seats} ${selectedPlan.value} seats`)
    tracer.scheduleRefresh()
  }

  function resetQuote() {
    selectedPlan.value = 'starter'
    activeCustomerId.value = 'acme'
    couponCode.value = 'LAUNCH10'
    order.seats = 3
    order.rush = false
    plans.starter.stock = 12
    plans.team.stock = 8
    pushTimeline('quote reset', 'baseline restored')
    tracer.scheduleRefresh()
  }

  function pushTimeline(label: string, detail: string) {
    timeline.value = [
      {
        detail,
        id: Date.now() + Math.random(),
        label,
      },
      ...timeline.value.slice(0, 5),
    ]
  }

  const planOptions = (Object.keys(plans) as PlanKey[]).map((plan) => ({
    label: plans[plan].label,
    value: plan,
  }))
  const customerOptions = (Object.keys(customers) as CustomerId[]).map((id) => ({
    label: customers[id].label,
    value: id,
  }))

  onScopeDispose(tracer.dispose)
  tracer.refresh()

  return {
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
    workspaceCards,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

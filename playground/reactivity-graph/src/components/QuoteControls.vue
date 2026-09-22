<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormNumberInput from '@antfu/design/components/Form/FormNumberInput.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import FormSwitch from '@antfu/design/components/Form/FormSwitch.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'
import { computed } from 'vue'

interface SelectOption {
  label: string
  value: string
}

interface QuoteOrder {
  rush: boolean
  seats: number
}

const props = defineProps<{
  activeCustomerId: string
  couponCode: string
  customerOptions: SelectOption[]
  order: QuoteOrder
  planOptions: SelectOption[]
  selectedPlan: string
}>()

const emit = defineEmits<{
  'receive-stock': []
  reset: []
  submit: []
  'update:active-customer-id': [value: string]
  'update:coupon-code': [value: string]
  'update:rush': [value: boolean]
  'update:seats': [value: number]
  'update:selected-plan': [value: string]
}>()

const customerModel = computed({
  get: () => props.activeCustomerId,
  set: (value) => emit('update:active-customer-id', value),
})
const planModel = computed({
  get: () => props.selectedPlan,
  set: (value) => emit('update:selected-plan', value),
})
const seatsModel = computed<number | undefined>({
  get: () => props.order.seats,
  set: (value) => emit('update:seats', value ?? 1),
})
const couponModel = computed({
  get: () => props.couponCode,
  set: (value) => emit('update:coupon-code', value),
})
const rushModel = computed({
  get: () => props.order.rush,
  set: (value) => emit('update:rush', value),
})
</script>

<template>
  <LayoutCard class="grid gap-4" elevated>
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="panel-heading">Quote controls</h2>
        <p class="mt-1 panel-subtitle">Change an input to update the graph.</p>
      </div>
      <ActionButton
        variant="text"
        size="sm"
        icon="i-ph:arrow-counter-clockwise"
        @click="emit('reset')"
      >
        Reset
      </ActionButton>
    </div>

    <LayoutSeparator />

    <div class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs color-muted font-500">Customer</span>
        <FormSelect v-model="customerModel" :options="customerOptions" class="w-full" />
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs color-muted font-500">Plan</span>
        <FormSelect v-model="planModel" :options="planOptions" class="w-full" />
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs color-muted font-500">Seats</span>
        <FormNumberInput v-model="seatsModel" :min="1" :max="16" class="w-full" />
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs color-muted font-500">Coupon</span>
        <FormTextInput v-model="couponModel" class="w-full font-mono" />
      </label>

      <FormSwitch v-model="rushModel" label="Rush delivery" />
    </div>

    <div class="grid grid-cols-2 gap-2 pt-1">
      <ActionButton class="justify-center" variant="primary" @click="emit('submit')">
        Submit order
      </ActionButton>
      <ActionButton class="justify-center" @click="emit('receive-stock')"> Restock </ActionButton>
    </div>
  </LayoutCard>
</template>

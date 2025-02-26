<script setup lang="ts" generic="Value extends number | string, Label, M extends boolean">
import type { ButtonProps } from './Button.vue'
import { vClosePopper } from 'floating-vue'
import { computed, useSlots } from 'vue'
import VueButton from './Button.vue'
import VueDropdown from './Dropdown.vue'

const props = withDefaults(defineProps<{
  modelValue: M extends true ? Value[] : Value
  multiple?: M
  options: { label: Label, value: Value }[]
  placeholder?: string
  autoClose?: boolean
  disabled?: boolean
  labelRenderer?: (label: Label) => string
  buttonProps?: ButtonProps
}>(), {
  // @ts-expect-error typing infer error from vue
  multiple: false,
  placeholder: 'Select...',
  autoClose: true,
  disabled: false,
  labelRenderer: (label: Label) => String(label),
  buttonClass: '',
  buttonProps: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: M extends true ? Value[] : Value]
}>()

defineSlots<{
  item: (props: { item: { label: Label, value: Value }, active: boolean, disabled: boolean }) => any
  button: () => any
}>()
const slots = useSlots()

const value = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const label = computed(() => {
  const option = props.options.find(i => i.value === value.value)
  return option?.label ? props.labelRenderer(option.label) : props.placeholder
})

function onToggleSelection(item: { label: Label, value: Value }) {
  if (props.multiple) {
    // @ts-expect-error typing infer error from vue
    value.value = value.value.includes(item.value) ? value.value.filter(i => i !== item.value) : [...value.value, item.value]
  }
  else {
    // @ts-expect-error typing infer error from vue
    value.value = item.value
  }
}
</script>

<template>
  <VueDropdown
    :label="label"
    v-bind="{
      buttonProps,
      disabled,
    }"
  >
    <template #popper>
      <div class="m1 min-w-35 w-auto flex flex-col">
        <template v-if="slots.item">
          <div
            v-for="item in options"
            :key="item.value" class="cursor-pointer" @click="onToggleSelection(item)"
          >
            <slot
              name="item" v-bind="{
                item,
                active: multiple ? (value as Value[]).includes(item.value) : item.value === value,
                disabled,
              }"
            />
          </div>
        </template>
        <template v-else>
          <VueButton
            v-for="item in options" :key="item.value"
            v-close-popper="autoClose" :disabled="disabled" round="normal"
            class="flex-[auto_1_1] not-hover:[&:not(.active)]:bg-transparent!"
            :class="{
              active: multiple ? (value as Value[]).includes(item.value) : item.value === value,
            }"
            @click="onToggleSelection(item)"
          >
            {{ item.label }}
          </VueButton>
        </template>
      </div>
    </template>
    <template v-if="slots.button" #default>
      <slot name="button" />
    </template>
    <template #button-icon-right>
      <div class="i-mdi-chevron-down" />
    </template>
  </VueDropdown>
</template>

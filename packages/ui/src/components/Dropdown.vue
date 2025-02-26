<script setup lang="ts" generic="T">
import type { FloatingVueCommonProps } from '../types'
import type { ButtonProps } from './Button.vue'
import { Dropdown } from 'floating-vue'
import { computed, provide } from 'vue'
import VueButton from './Button.vue'

const props = withDefaults(defineProps<{
  label?: string
  buttonProps?: ButtonProps
  buttonClass?: string
} & FloatingVueCommonProps>(), {
  trigger: 'click',
  buttonClass: '',
  distance: 0,
  disabled: false,
  buttonProps: () => ({}),
})

defineEmits<{
  'update:visible': [value: boolean]
}>()
defineSlots<{
  'default': () => any
  'popper': (props: { hide: () => void }) => any
  'button-icon': () => any
  'button-icon-right': () => any
}>()
provide('$ui-dropdown-disabled', computed(() => props.disabled))
</script>

<template>
  <Dropdown
    :disabled="disabled" class="inline-block w-auto" :shown="shown"
    :triggers="[trigger]" :distance="distance + 6" :placement="placement"
    :skidding="skidding"
    @update:shown="v => $emit('update:visible', v)"
    @click="(e: MouseEvent) => {
      e.stopPropagation()
    }"
  >
    <slot>
      <VueButton
        v-bind="{
          ...buttonProps,
          disabled,
        }"
        :class="buttonClass"
      >
        <template v-if="label" #default>
          {{ label }}
        </template>
        <template #icon>
          <slot name="button-icon" />
        </template>
        <template #icon-right>
          <slot name="button-icon-right" />
        </template>
      </VueButton>
    </slot>
    <template #popper="{ hide }">
      <div class="overflow-hidden rounded-lg shadow-lg">
        <slot v-bind="{ hide }" name="popper">
          <div class="p2 opacity-40">
            Empty...
          </div>
        </slot>
      </div>
    </template>
  </Dropdown>
</template>

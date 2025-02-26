<script setup lang="ts">
import type { ComputedGetter } from 'vue'
import type { ButtonProps } from './Button.vue'
import { vClosePopper } from 'floating-vue'
import { inject } from 'vue'
import VueButton from './Button.vue'

const props = withDefaults(defineProps<ButtonProps & {
  keepOpen?: boolean
}>(), {
  keepOpen: false,
})

const disabled = inject<ComputedGetter<boolean> | undefined>('$ui-dropdown-disabled', undefined)!
</script>

<template>
  <VueButton
    v-close-popper
    v-bind="{
      ...props,
      round: false,
    }"
    :disabled="disabled"
    class="w-full justify-start transition-colors not-action:bg-transparent!"
  >
    <template #icon>
      <slot name="icon" />
    </template>
    <slot />
  </VueButton>
</template>

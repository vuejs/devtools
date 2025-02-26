<script setup lang="ts">
import type { FloatingVueCommonProps } from '../types'
import { Tooltip } from 'floating-vue'

defineProps<FloatingVueCommonProps>()
</script>

<template>
  <Tooltip
    :disabled="disabled"
    :placement="placement"
    v-bind="$attrs"
  >
    <slot />
    <template #popper>
      <slot name="popper" />
    </template>
  </Tooltip>
</template>

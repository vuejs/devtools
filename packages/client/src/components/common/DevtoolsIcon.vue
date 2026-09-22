<script setup lang="ts">
import { computed } from 'vue'
import { getMaterialIconText, isIconClass, isUrlIcon } from '../../utils/icons'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    icon?: string
    fallback?: string
    title?: string
  }>(),
  {
    icon: undefined,
    fallback: 'i-carbon-play',
    title: undefined,
  },
)

const icon = computed(() => props.icon || props.fallback)
const imageIcon = computed(() => (isUrlIcon(icon.value) ? icon.value : undefined))
const materialIconText = computed(() => getMaterialIconText(icon.value))
const classIcon = computed(() => {
  if (imageIcon.value || materialIconText.value) return
  return isIconClass(icon.value) ? icon.value : props.fallback
})
</script>

<template>
  <img
    v-if="imageIcon"
    v-bind="$attrs"
    :src="imageIcon"
    :alt="title ?? ''"
    :title="title"
    aria-hidden="true"
  />
  <span
    v-else-if="materialIconText"
    v-bind="$attrs"
    class="material-icons"
    :title="title"
    aria-hidden="true"
  >
    {{ materialIconText }}
  </span>
  <span v-else v-bind="$attrs" :class="classIcon" :title="title" aria-hidden="true" />
</template>

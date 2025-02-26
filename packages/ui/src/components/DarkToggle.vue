<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import { computed, nextTick } from 'vue'
import { useDevToolsColorMode } from '../composables'

const props = withDefaults(defineProps<{
  isDark?: boolean
  animation?: boolean
  animationDuration?: number
}>(), {
  isDark: false,
  animation: true,
  animationDuration: 400,
})

const isDarkModel = useVModel(props, 'isDark')

const { colorMode: mode } = useDevToolsColorMode({
  initialValue: isDarkModel.value ? 'dark' : 'light',
  onChanged: (value) => {
    isDarkModel.value = value === 'dark'
  },
})

const isDark = computed({
  get: () => mode.value === 'dark',
  set: v => mode.value = v ? 'dark' : 'light',
})

const isAppearanceTransition = !!document.startViewTransition
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
/**
 * Credit to [@hooray](https://github.com/hooray)
 * @see https://github.com/vuejs/vitepress/pull/2347
 */
function toggle(event?: MouseEvent) {
  if (!isAppearanceTransition || !event || !props.animation) {
    isDark.value = !isDark.value
    return
  }
  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )
  const transition = document.startViewTransition(async () => {
    isDark.value = !isDark.value
    await nextTick()
  })
  transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ]
    document.documentElement.animate(
      {
        clipPath: isDark.value
          ? [...clipPath].reverse()
          : clipPath,
      },
      {
        duration: props.animationDuration,
        easing: 'ease-in',
        pseudoElement: isDark.value
          ? '::view-transition-old(root)'
          : '::view-transition-new(root)',
      },
    )
  })
}
</script>

<template>
  <span class="$ui-dark-toggle-vtr">
    <slot v-bind="{ mode, isDark, toggle }" />
  </span>
</template>

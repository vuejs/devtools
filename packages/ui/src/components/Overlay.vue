<script setup lang="ts">
export interface OverlayProps {
  dim?: boolean
  blur?: boolean
  /**
   * Position of the overlay, default is `fixed`
   */
  position?: 'fixed' | 'absolute'
}

withDefaults(defineProps<OverlayProps>(), {
  position: 'fixed',
})
</script>

<template>
  <div
    class="left-0 top-0 $ui-z-max h-full w-full $ui-fcc $ui-bg-base transition-opacity transition-duration-300"
    :class="[
      dim ? 'bg-opacity-50!' : 'bg-opacity-0!',
      blur ? 'backdrop-blur-sm' : '',
      position,
    ]"
  >
    <slot />
  </div>
</template>

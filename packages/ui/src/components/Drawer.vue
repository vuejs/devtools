<script setup lang="ts">
import type { OverlayProps } from './Overlay.vue'
import { onKeyStroke, useElementSize, useVModel } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import Overlay from './Overlay.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mountTo?: string | HTMLElement
  placement?: 'left' | 'right' | 'top' | 'bottom'
  closeOutside?: boolean
  closable?: boolean
  contentClass?: string
  permanent?: boolean
  contentBlur?: boolean
  top?: string | HTMLElement
} & OverlayProps>(), {
  mountTo: 'body',
  placement: 'right',
  closeOutside: true,
  closable: true,
  permanent: false,
  contentBlur: false,
})

const emit = defineEmits<{
  'update:modelValue': [modelValue: boolean]
  'close': []
}>()

const { height } = useElementSize(() => typeof props.top === 'string' ? document.querySelector<HTMLElement>(props.top)! : props.top, undefined, { box: 'border-box' })

const show = useVModel(props, 'modelValue', emit)

const placementClasses: Record<typeof props['placement'], {
  class: string
  transition: string
}> = {
  left: {
    class: 'left-0 h-full b-r',
    transition: '[&_.drawer]:translate-x--100%',
  },
  right: {
    class: 'right-0 h-full b-l',
    transition: '[&_.drawer]:translate-x-full',
  },
  top: {
    class: 'w-full b-b',
    transition: '[&_.drawer]:translate-y--100%',
  },
  bottom: {
    class: 'bottom-0 w-full b-t',
    transition: '[&_.drawer]:translate-y-100%',
  },
}

onKeyStroke('Escape', () => {
  if (props.closable)
    show.value = false
})

const classes = computed(() => placementClasses[props.placement])

const isMount = ref(false)

onMounted(() => isMount.value = true)
</script>

<template>
  <Teleport v-if="isMount || mountTo === 'body'" :to="mountTo">
    <Transition
      :enter-from-class="`${classes.transition}`"
      :leave-to-class="`${classes.transition}`"
    >
      <Overlay
        v-if="show"
        :class="{
          'pointer-events-none': permanent,
        }"
        :dim :blur :position @click="closeOutside && closable && (show = false)"
      >
        <div
          :class="[classes.class, contentClass ?? '', contentBlur ? '$ui-glass-effect' : '$ui-bg-base']"
          :style="{
            top: placement === 'bottom' ? 'auto' : `${height}px`,
            height: ['top', 'bottom'].includes(placement) ? 'auto' : `calc(100% - ${height}px)`,
          }"
          class="drawer pointer-events-auto absolute min-w-25 of-auto $ui-border-base transition-transform transition-duration-300"
          @click.stop
        >
          <div v-if="closable" class="i-carbon-close absolute right-1.5 top-1.5 $ui-z-max cursor-pointer p1 text-lg $ui-text" @click="show = false" />
          <slot />
        </div>
      </Overlay>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { OverlayProps } from './Overlay.vue'
import { onKeyStroke, useScrollLock, useVModel } from '@vueuse/core'
import { onMounted, ref, watchEffect } from 'vue'
import Button from './Button.vue'
import Overlay from './Overlay.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    autoClose?: boolean
    title?: string
    width?: string
    height?: string
    closable?: boolean
    mountTo?: string | HTMLElement
  } & OverlayProps>(),
  {
    title: 'Dialog',
    modelValue: false,
    autoClose: true,
    width: '32rem',
    height: '18rem',
    closable: true,
    mountTo: 'body',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'update:modelValue', value: boolean): void
}>()

const show = useVModel(props, 'modelValue', emit, { passive: true })

const isScrollLocked = useScrollLock(() => window.document.documentElement)
watchEffect(() => {
  if (show.value)
    isScrollLocked.value = true
  else
    isScrollLocked.value = false
})

function close() {
  if (show.value && props.autoClose)
    show.value = false
}

onKeyStroke('Escape', () => {
  close()
})

const isMount = ref(false)

onMounted(() => isMount.value = true)
</script>

<template>
  <Teleport v-if="isMount || mountTo === 'body'" :to="mountTo">
    <Transition
      enter-from-class="opacity-0 [&_.modal]:scale-95 [&_.content,&_.footer]:translate-y--2.5 [&_.content,&_.footer]:opacity-0"
      enter-to-class="opacity-100 [&_.modal]:scale-100"
      leave-from-class="opacity-100 [&_.modal]:scale-100"
      leave-to-class="opacity-0 [&_.modal]:scale-95"
    >
      <Overlay v-if="show" :dim :blur :position>
        <div
          class="modal relative grid grid-rows-[1.875rem_1fr_2.5rem] $ui-base max-h-[calc(100vh-6.25rem)] max-w-[calc(100vw-6.25rem)] min-h-6.25rem min-w-12.5rem gap-2.5 rounded-md bg-white px6 py4.5 color-gray-800 shadow-2xl transition-transform transition-duration-300 dark:bg-gray-900 dark:color-gray-200"
          :style="{
            width: props.width,
            height: props.height,
          }"
        >
          <div class="h7.5 w-full $ui-fbc">
            <div class="text-4.5">
              <slot name="title">
                {{ props.title }}
              </slot>
            </div>
            <div v-if="closable" class="h6 w6 $ui-fcc cursor-pointer rounded-full transition-colors hover:bg-primary-100 dark:hover:bg-gray-700" @click="close">
              <div class="i-carbon-close" />
            </div>
          </div>
          <div class="content transition-all transition-duration-300">
            <slot />
          </div>
          <div class="footer h8 w-full transition-all transition-duration-300 delay-250">
            <slot name="footer">
              <slot name="footer">
                <div class="$ui-fcc">
                  <Button type="primary" @click="close">
                    close
                  </Button>
                </div>
              </slot>
            </slot>
          </div>
        </div>
      </Overlay>
    </Transition>
  </Teleport>
</template>

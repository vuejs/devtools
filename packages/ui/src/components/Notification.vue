<script setup lang="ts">
import type { VueNotificationOptions } from '../composables/notification'
import { computed, onMounted, ref } from 'vue'

type NotificationType = NonNullable<VueNotificationOptions['type']>

const props = withDefaults(defineProps<VueNotificationOptions>(), {
  placement: 'top-center',
  type: 'info',
  duration: 3000,
})

const icons: Record<NotificationType, string> = {
  success: 'i-carbon-checkmark',
  info: 'i-material-symbols-light-info',
  warning: 'i-carbon-warning',
  error: 'i-carbon-close',
}

const typeClasses: Record<NotificationType, string> = {
  success: 'text-primary-500 border-primary-200 dark:text-primary-200 dark:border-primary-500',
  info: 'text-blue-4 border-blue-2 dark:text-blue-2 dark:border-blue-4',
  warning: 'text-amber-4 border-amber-2 dark:border-amber-4',
  error: 'text-red-4 border-red-2 dark:border-red-4',
}

const show = ref(false)

onMounted(() => {
  show.value = true
  setTimeout(() => {
    show.value = false
  }, props.duration)
})

const transitionClass = computed(() => props.placement.startsWith('top') ? 'translate-y--300%' : 'translate-y-300%')
</script>

<template>
  <div
    class="fixed left-0 right-0 $ui-z-max-override text-center"
    :class="[
      { 'top-0': placement.startsWith('top') },
      { 'bottom-0': placement.startsWith('bottom') },
    ]"
  >
    <Transition
      :enter-from-class="transitionClass"
      :leave-to-class="transitionClass"
      @after-leave="() => {
        if (!show) {
          onClose?.()
        }
      }"
    >
      <div
        v-if="show"
        class="flex transition-all duration-300"
        :style="{ justifyContent: placement.includes('right') ? 'right' : placement.includes('left') ? 'left' : 'center' }"
      >
        <div
          class="m3 flex-inline items-center gap2 b-1 b-1 rounded px4 py1 shadow transition-all duration-300 $ui-bg-base"
          :class="[classes, typeClasses[type]]"
        >
          <div :class="icons[type]" />
          <div>{{ message }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

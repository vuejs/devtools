import type { MaybeRefOrGetter } from '@vueuse/core'
import { useEventListener } from '@vueuse/core'
import { ref } from 'vue'

export interface UseHoverOptions {
  enter?: () => void
  leave?: () => void
  initial?: boolean
}

export function useHover(el: MaybeRefOrGetter<HTMLElement | null | undefined>, options: UseHoverOptions = {}) {
  const {
    enter = () => { },
    leave = () => { },
    initial = false,
  } = options
  const isHovering = ref(initial)

  useEventListener(el, 'mouseenter', () => {
    isHovering.value = true
    enter()
  })
  useEventListener(el, 'mouseleave', () => {
    isHovering.value = false
    leave()
  })

  return {
    isHovering,
  }
}

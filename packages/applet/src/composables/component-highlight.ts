import { rpc } from '@vue/devtools-core'
import { useDebounceFn } from '@vueuse/core'

const THROTTLE_TIME = 200

export function useComponentHighlight() {
  const highlight = useDebounceFn((id: string) => {
    return rpc.value.highlighComponent(id)
  }, THROTTLE_TIME)

  const unhighlight = useDebounceFn(() => {
    return rpc.value.unhighlight()
  }, THROTTLE_TIME)

  return {
    highlight,
    unhighlight,
  }
}

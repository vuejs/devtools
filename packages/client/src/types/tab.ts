import type { CustomTab } from '@vue/devtools-kit'
import type { MaybeRefOrGetter } from 'vue'

export interface ModuleBuiltinTab extends Pick<CustomTab, 'name' | 'icon' | 'title' | 'category'> {
  fallbackIcon?: string
  order?: number
  path: string
  show?: () => MaybeRefOrGetter<any>
  badge?: () => MaybeRefOrGetter<number | string | undefined>
  onClick?: () => void
}

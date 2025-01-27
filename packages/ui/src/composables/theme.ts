import type { UseColorModeOptions } from '@vueuse/core'
import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

export const THEME_KEY = '__vue-devtools-theme__'

export function useDevToolsColorMode(options: Omit<UseColorModeOptions, 'storageKey'> = {}) {
  const colorMode = useColorMode({
    ...options,
    storageKey: THEME_KEY,
  })
  return {
    colorMode,
    isDark: computed(() => colorMode.value === 'dark'),
  }
}

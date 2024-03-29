import { computed, ref } from 'vue'

export const darkMode = ref(false)

export function useDarkMode() {
  return {
    darkMode: computed(() => darkMode.value),
  }
}

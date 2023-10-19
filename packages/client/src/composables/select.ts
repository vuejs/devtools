import type { Ref } from 'vue'
import { ref } from 'vue'

export function createSelectContext(id: string) {
  const selected = ref<string>('')

  provide<Ref<string>>(`SelectedSymbol${id}`, selected)
  return {
    selected,
    id,
  }
}

function useSelectContext(id: string) {
  const selected = inject<Ref<string>>(`SelectedSymbol${id}`)!
  return {
    selected,
    id,
  }
}

export function useSelect(groupId: string, onSelect?: (id: string) => void) {
  const { selected } = useSelectContext(groupId)
  const isSelected = (id: string) => selected.value === id
  const toggleSelected = (id: string) => {
    selected.value = id
    onSelect?.(id)
  }
  return {
    isSelected,
    toggleSelected,
  }
}

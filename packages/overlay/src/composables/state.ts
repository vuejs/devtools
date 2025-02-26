import type { DeepReadonly, Ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { readonly } from 'vue'

interface DevToolsFrameState {
  width: number
  height: number
  top: number
  left: number
  open: boolean
  route: string
  position: string
  isFirstVisit: boolean
  closeOnOutsideClick: boolean
  minimizePanelInactive: number
  preferShowFloatingPanel: boolean
  reduceMotion: boolean
}

export interface UseFrameStateReturn {
  state: DeepReadonly<Ref<DevToolsFrameState>>
  updateState: (value: Partial<DevToolsFrameState>) => void
}

const state = useLocalStorage<DevToolsFrameState>('__vue-devtools-frame-state__', {
  width: 80,
  height: 60,
  top: 0,
  left: 50,
  open: false,
  route: '/',
  position: 'bottom',
  isFirstVisit: true,
  closeOnOutsideClick: false,
  minimizePanelInactive: 5000,
  preferShowFloatingPanel: true,
  reduceMotion: false,
})

export function useFrameState(): UseFrameStateReturn {
  function updateState(value: Partial<DevToolsFrameState>) {
    state.value = {
      ...state.value,
      ...value,
    }
  }

  return {
    state: readonly(state),
    updateState,
  }
}

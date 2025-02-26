import type { InjectionKey, Ref } from 'vue'
import { inject, provide, ref } from 'vue'

type CustomInspectorState = Partial<{
  homepage: string
  id: string
  pluginId: string
  label: string
  logo: string
  timelineLayerIds: string[]
  treeFilterPlaceholder: string
  stateFilterPlaceholder: string
}>

const VueDevToolsStateSymbol: InjectionKey<Ref<CustomInspectorState>> = Symbol.for('VueDevToolsCustomInspectorStateSymbol')

export function useCustomInspectorState() {
  return inject(VueDevToolsStateSymbol)!
}

export function createCustomInspectorStateContext() {
  const state = ref({
    homepage: '',
    id: '',
    label: '',
    logo: '',
    timelineLayerIds: [],
  }) as Ref<CustomInspectorState>
  provide(VueDevToolsStateSymbol, state)
  return state
}

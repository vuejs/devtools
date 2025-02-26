import { DevToolsMessagingEvents, onRpcConnected, rpc } from '@vue/devtools-core'
import { onUnmounted, ref } from 'vue'

export interface CustomInspectorType {
  id: string
  label: string
  logo: string
  icon: string
  packageName: string | undefined
  homepage: string | undefined
  pluginId: string
}

export function useCustomInspector() {
  const registeredInspector = ref<CustomInspectorType[]>([])
  const inspectors = ref<CustomInspectorType[]>([])

  function onUpdate(inspector: CustomInspectorType[]) {
    inspectors.value = inspector
    if (inspector.length < registeredInspector.value.length) {
      registeredInspector.value = []
    }
    inspectors.value.forEach((inspector) => {
      register(inspector)
    })
  }
  onRpcConnected(() => {
    rpc.value.getCustomInspector().then((inspector) => {
      inspectors.value = inspector
      inspectors.value.forEach((inspector) => {
        register(inspector)
      })
    })
    rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_UPDATED, onUpdate)
  })

  function register(inspector: CustomInspectorType) {
    if (registeredInspector.value.some(i => i.id === inspector.id)) {
      return
    }

    registeredInspector.value.push(inspector)
  }

  onUnmounted(() => {
    rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_UPDATED, onUpdate)
  })

  return {
    registeredInspector,
    register,
  }
}

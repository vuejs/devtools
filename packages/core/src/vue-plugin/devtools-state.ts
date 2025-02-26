import type { AppRecord, CustomCommand, CustomTab } from '@vue/devtools-kit'
import type { App, InjectionKey, Ref } from 'vue'
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { DevToolsMessagingEvents, onRpcConnected, rpc } from '../rpc'

interface DevToolsState {
  connected: boolean
  clientConnected: boolean
  vueVersion: string
  tabs: CustomTab[]
  commands: CustomCommand[]
  vitePluginDetected: boolean
  appRecords: AppRecord[]
  activeAppRecordId: string
  timelineLayersState: Record<string, boolean>
}

type DevToolsRefState = {
  [P in keyof DevToolsState]: Ref<DevToolsState[P]>
}

const VueDevToolsStateSymbol: InjectionKey<DevToolsRefState> = Symbol.for('__VueDevToolsStateSymbol__')

export function VueDevToolsVuePlugin() {
  return {
    install(app: App) {
      const state = createDevToolsStateContext()
      state.getDevToolsState()
      app.provide(VueDevToolsStateSymbol, state)
      app.config.globalProperties.$getDevToolsState = state.getDevToolsState
      app.config.globalProperties.$disconnectDevToolsClient = () => {
        state.clientConnected.value = false
        state.connected.value = false
      }
    },
  }
}

export function createDevToolsStateContext() {
  const connected = ref(false)
  const clientConnected = ref(false)
  const vueVersion = ref('')
  const tabs = ref<CustomTab[]>([])
  const commands = ref<CustomCommand[]>([])
  const vitePluginDetected = ref(false)
  const appRecords = ref<Array<AppRecord>>([])
  const activeAppRecordId = ref('')
  const timelineLayersState = ref<Record<string, boolean>>({})

  function updateState(data: DevToolsState) {
    connected.value = data.connected
    clientConnected.value = data.clientConnected
    vueVersion.value = data.vueVersion || ''
    tabs.value = data.tabs
    commands.value = data.commands
    vitePluginDetected.value = data.vitePluginDetected
    appRecords.value = data.appRecords
    activeAppRecordId.value = data.activeAppRecordId!
    timelineLayersState.value = data.timelineLayersState!
  }

  function getDevToolsState() {
    onRpcConnected(() => {
      rpc.value.devtoolsState().then((data) => {
        updateState(data as DevToolsState)
      })
      rpc.functions.off(DevToolsMessagingEvents.DEVTOOLS_STATE_UPDATED, updateState)
      rpc.functions.on(DevToolsMessagingEvents.DEVTOOLS_STATE_UPDATED, updateState)
    })
  }

  return {
    getDevToolsState,
    connected,
    clientConnected,
    vueVersion,
    tabs,
    commands,
    vitePluginDetected,
    appRecords,
    activeAppRecordId,
    timelineLayersState,
  }
}

export function useDevToolsState() {
  return inject(VueDevToolsStateSymbol)!
}

const fns: (() => void)[] = []

export function onDevToolsConnected(fn: () => void) {
  const { connected, clientConnected } = useDevToolsState()

  fns.push(fn)

  onUnmounted(() => {
    fns.splice(fns.indexOf(fn), 1)
  })

  const devtoolsReady = computed(() => clientConnected.value && connected.value)

  if (devtoolsReady.value) {
    fn()
  }
  else {
    const stop = watch(devtoolsReady, (v) => {
      if (v) {
        fn()
        stop()
      }
    })
  }

  return () => {
    fns.splice(fns.indexOf(fn), 1)
  }
}

export function refreshCurrentPageData() {
  fns.forEach(fn => fn())
}

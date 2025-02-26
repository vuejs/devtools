<script setup lang="ts">
import { DevToolsMessagingEvents, onDevToolsConnected, onRpcConnected, refreshCurrentPageData, rpc, useDevToolsState } from '@vue/devtools-core'
import { useDevToolsColorMode } from '@vue/devtools-ui'
import { Pane, Splitpanes } from 'splitpanes'

useDevToolsColorMode()
const router = useRouter()
const route = useRoute()
const hostEnv = useHostEnv()
const { connected, clientConnected, activeAppRecordId: _activeAppRecordId, appRecords: _appRecords } = useDevToolsState()
const clientState = devtoolsClientState

const devtoolsReady = computed(() => connected.value && clientConnected.value)
const isUtilityView = computed(() => route.path.startsWith('/__') || route.path === '/')
const sidebarExpanded = computed(() => clientState.value.expandSidebar)
const splitScreenEnabled = computed(() => clientState.value.splitScreen.enabled)
const splitScreenSize = computed({
  get: () => clientState.value.splitScreen.size,
  set: v => clientState.value.splitScreen.size = v,
})

watchEffect(() => {
  const scale = devtoolsClientState.value.scale
  document.documentElement.style.fontSize = `${scale * 15}px`
})

onRpcConnected(() => {
  watchEffect(() => {
    rpc.value.emit('update-client-state', {
      minimizePanelInteractive: devtoolsClientState.value.minimizePanelInteractive,
      closeOnOutsideClick: devtoolsClientState.value.interactionCloseOnOutsideClick,
      showFloatingPanel: devtoolsClientState.value.showPanel,
      reduceMotion: devtoolsClientState.value.reduceMotion,
    })
  })
})

watch(devtoolsReady, (v) => {
  if (v) {
    router.replace(clientState.value.isFirstVisit ? '/' : clientState.value.route)
    router.afterEach(() => {
      const path = route.path
      if (path.includes('__'))
        return
      clientState.value.route = path
    })
  }
}, {
  immediate: true,
})

useEventListener('keydown', (e) => {
  if (e.code === 'KeyD' && e.altKey && e.shiftKey)
    rpc.value.emit('toggle-panel')
})

watchEffect(() => {
  activeAppRecords.value = _appRecords.value
  activeAppRecordId.value = _activeAppRecordId.value
})

onRpcConnected(() => {
  rpc.value.initDevToolsServerListener()
  rpc.value.checkVueInspectorDetected().then((detected) => {
    if (detected) {
      vueInspectorDetected.value = true
      registerCommands(() =>
        [{
          id: 'action:vue-inspector',
          title: 'Inspector',
          icon: 'i-carbon-select-window',
          action: async () => {
            rpc.value.emit('toggle-panel', false)
            await rpc.value.enableVueInspector()
          },
        }],
      )
    }
  })
})

function onActiveAppUnmounted() {
  router.push('/overview').then(() => {
    refreshCurrentPageData()
  })
}

onDevToolsConnected(() => {
  rpc.functions.on(DevToolsMessagingEvents.ACTIVE_APP_UNMOUNTED, onActiveAppUnmounted)
})

// register commands
const { copy } = useCopy()
const eyeDropper = useEyeDropper({})

registerCommands(() => [
  ...(eyeDropper.isSupported.value
    ? [{
        id: 'action:eye-dropper',
        title: 'Color Picker',
        icon: 'i-carbon-eyedropper',
        action: async () => {
          rpc.value.emit('toggle-panel', false)
          const { sRGBHex } = await eyeDropper.open() || {}
          if (sRGBHex)
            copy(sRGBHex)
        },
      }]
    : []),
])

onMounted(() => {
  onRpcConnected(() => {
    rpc.value.toggleClientConnected(true)
  })
})

onUnmounted(() => {
  rpc.value.toggleClientConnected(false)
  rpc.functions.off(DevToolsMessagingEvents.ACTIVE_APP_UNMOUNTED, onActiveAppUnmounted)
})

function toggleDevToolsClientVisible(params: { visible: boolean, host: string }) {
  const { host, visible } = params
  rpc.value.updateDevToolsClientDetected({
    [host]: visible,
  })
}

watchEffect(() => {
  const html = document.documentElement
  html.classList.toggle('reduce-motion', devtoolsClientState.value.reduceMotion)
})
</script>

<template>
  <main class="fixed inset-0 h-screen w-screen $ui-bg-base">
    <AppConnecting v-if="!devtoolsReady" />
    <div
      v-else
      class="h-full of-auto transition-base"
      :class="isUtilityView ? 'flex' : sidebarExpanded ? 'grid grid-cols-[250px_1fr]' : 'grid grid-cols-[50px_1fr]'"
      h-full h-screen of-hidden font-sans bg-base
    >
      <SideNav v-if="!isUtilityView" of-x-hidden of-y-auto @toggle-devtools-client-visible="toggleDevToolsClientVisible" />
      <Splitpanes
        h-full of-hidden
        @resize="splitScreenSize = $event.map((v) => v.size)"
      >
        <Pane h-full class="of-auto!" min-size="10" :size="splitScreenSize[0]">
          <RouterView />
        </Pane>
        <Pane v-if="!isUtilityView && splitScreenEnabled" relative h-full class="of-auto!" :size="splitScreenSize[1]">
          <SplitScreen />
        </Pane>
      </Splitpanes>
    </div>
    <CommandPalette />
  </main>
</template>

<script setup lang="ts">
import { Components } from '@vue/devtools-applet'
import { DevToolsMessagingEvents, functions, onRpcConnected, rpc } from '@vue/devtools-core'
import { createRpcClient } from '@vue/devtools-kit'
import { useDark } from '@vueuse/core'
import { useCounterStore } from './stores'
import '@vue/devtools-applet/style.css'
// import Tres from './components/Tres.vue'
// import Hello from './components/Hello.vue'

const isDark = useDark()
// user app
const counterStore = useCounterStore()

createRpcClient(functions, {
  preset: 'broadcast',
})

// devtools
const appConnected = ref(false)
const clientConnected = ref(false)
const connected = computed(() => appConnected.value && clientConnected.value)

function initVueDevToolsState() {
  rpc.value.devtoolsState().then((data) => {
    if (!data)
      return
    appConnected.value = data!.connected
    clientConnected.value = data!.clientConnected
  })

  rpc.functions.on(DevToolsMessagingEvents.DEVTOOLS_STATE_UPDATED, (data) => {
    if (!data)
      return
    appConnected.value = data!.connected
    clientConnected.value = data!.clientConnected
  })
}

onRpcConnected(() => {
  initVueDevToolsState()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col items-center justify-center">
    <div i-carbon-sun dark:i-carbon-moon translate-y--1px @click="isDark = !isDark" />

    <div select-none>
      Count:{{ counterStore.count }}
      <span @click="counterStore.increment">➕</span>
      <span @click="counterStore.decrement">➖</span>
    </div>
    <div h-150 w-200 border="1 green solid">
      <Components v-if="connected" />
      <div v-else class="h-full flex items-center justify-center">
        Connecting...
      </div>
    </div>
  </div>
  <!-- <Hello /> -->
  <!-- <Tres /> -->
</template>

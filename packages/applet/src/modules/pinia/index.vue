<script setup lang="ts">
import { onRpcConnected, rpc } from '@vue/devtools-core'
import { computed, provide, ref } from 'vue'
import { createCustomInspectorStateContext } from '~/composables/custom-inspector-state'
import { registerVirtualRouter, VirtualRoute } from '~/composables/virtual-router'
import About from './components/About.vue'
import Settings from './components/Settings.vue'
import Store from './components/store/Index.vue'
import Timeline from './components/timeline/Index.vue'
import { PiniaPluginDescriptorId, PiniaPluginInspectorId } from './constants'

const pluginSettings = ref(null)
provide('pluginSettings', pluginSettings)

const routes = computed(() => {
  return [
    {
      path: '/store',
      name: 'Store',
      component: Store,
      icon: 'i-carbon-tree-view-alt',
    },
    {
      path: '/timeline',
      name: 'Timeline',
      component: Timeline,
      icon: 'i-mdi:timeline-clock-outline',
    },
    {
      path: '/',
      name: 'About',
      component: About,
      icon: 'i-logos-pinia',
    },
    pluginSettings.value && ({
      path: '/settings',
      name: 'Settings',
      component: Settings,
      icon: 'i-mdi:cog-outline',
    }),
  ].filter(Boolean) as VirtualRoute[]
})

const { VirtualRouterView, restoreRouter } = registerVirtualRouter(routes, {
  defaultRoutePath: '/store',
})

const inspectorState = createCustomInspectorStateContext()

onRpcConnected(() => {
  rpc.value.getPluginSettings(PiniaPluginDescriptorId).then((settings) => {
    if (settings.options) {
      // @ts-expect-error skip type check
      pluginSettings.value = settings
    }
    else {
      pluginSettings.value = null
    }
  })
  rpc.value.getInspectorInfo(PiniaPluginInspectorId).then((payload) => {
    if (!payload)
      return
    inspectorState.value = {
      stateFilterPlaceholder: payload.stateFilterPlaceholder,
      treeFilterPlaceholder: payload.treeFilterPlaceholder,
    }
  })
})
</script>

<template>
  <div h-full w-full>
    <VirtualRouterView />
  </div>
</template>

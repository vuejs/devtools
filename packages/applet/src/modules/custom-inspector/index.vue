<script setup lang="ts">
import { onRpcConnected, rpc } from '@vue/devtools-core'
import { computed, onUnmounted, provide, ref, watch } from 'vue'

import AppConnecting from '~/components/basic/AppConnecting.vue'
import { createCustomInspectorStateContext } from '~/composables/custom-inspector-state'
import { registerVirtualRouter, VirtualRoute } from '~/composables/virtual-router'
import About from './components/About.vue'
import Settings from './components/Settings.vue'
import State from './components/state/Index.vue'
import Timeline from './components/timeline/Index.vue'

const props = defineProps<{
  id: string
  pluginId: string
}>()

const emit = defineEmits(['loadError'])
const inspectorState = createCustomInspectorStateContext()
const loading = ref(false)
const pluginSettings = ref(null)
provide('pluginSettings', pluginSettings)

const routes = computed(() => {
  return [
    {
      path: '/state',
      name: 'State',
      component: State,
      icon: 'i-carbon-tree-view-alt',
    },
    inspectorState.value.timelineLayerIds?.length && ({
      path: '/timeline',
      name: 'Timeline',
      component: Timeline,
      icon: 'i-mdi:timeline-clock-outline',
    }),
    {
      path: '/about',
      name: 'About',
      component: About,
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
  defaultRoutePath: '/state',
})

function getInspectorInfo() {
  loading.value = true
  onRpcConnected(() => {
    rpc.value.getInspectorInfo(props.id).then((payload) => {
      if (!payload) {
        emit('loadError')
        return
      }
      const state = {
        homepage: payload?.homepage,
        id: payload?.id,
        label: payload?.label,
        logo: payload?.logo,
        timelineLayerIds: payload?.timelineLayers.map(item => item.id),
        pluginId: props.pluginId,
        treeFilterPlaceholder: payload.treeFilterPlaceholder,
        stateFilterPlaceholder: payload.stateFilterPlaceholder,
      }
      inspectorState.value = state
      restoreRouter()
      loading.value = false
    })
    rpc.value.getPluginSettings(props.pluginId).then((settings) => {
      if (settings.options) {
        // @ts-expect-error skip type check
        pluginSettings.value = settings
      }
      else {
        pluginSettings.value = null
      }
    })
  })
}

watch(() => props.id, () => {
  getInspectorInfo()
}, {
  immediate: true,
})

onUnmounted(() => {
  rpc.value.unhighlight()
})
</script>

<template>
  <div h-full w-full>
    <div v-if="loading">
      <AppConnecting />
    </div>
    <VirtualRouterView v-else />
  </div>
</template>

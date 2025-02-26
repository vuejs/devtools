<script setup lang="ts">
import { onRpcConnected, rpc } from '@vue/devtools-core'
import { ref, watch } from 'vue'
import { createCustomInspectorStateContext } from '~/composables/custom-inspector-state'
import { registerVirtualRouter } from '~/composables/virtual-router'
import About from './components/About.vue'
import Routes from './components/routes/Index.vue'
import Timeline from './components/timeline/Index.vue'

const props = defineProps<{
  id: string
}>()
const inspectorState = createCustomInspectorStateContext()
const loading = ref(false)
const { VirtualRouterView, restoreRouter } = registerVirtualRouter([
  {
    path: '/routes',
    name: 'Routes',
    component: Routes,
    icon: 'i-carbon-tree-view-alt',
  },
  {
    path: '/timeline',
    name: 'Timeline',
    component: Timeline,
    icon: 'i-mdi:timeline-clock-outline',
  },
  {
    path: '/about',
    name: 'About',
    component: About,
    icon: 'i-ri-route-line',
  },
], {
  defaultRoutePath: '/routes',
})

function getInspectorInfo() {
  loading.value = true
  onRpcConnected(() => {
    rpc.value.getInspectorInfo(props.id).then((payload) => {
      if (!payload) {
        return
      }
      const state = {
        homepage: payload?.homepage,
        id: payload?.id,
        label: payload?.label,
        logo: payload?.logo,
        timelineLayerIds: payload?.timelineLayers.map(item => item.id),
      }
      inspectorState.value = state
      restoreRouter()
      loading.value = false
    })
  })
}

watch(() => props.id, (v) => {
  if (v) {
    getInspectorInfo()
  }
})
</script>

<template>
  <div h-full w-full>
    <VirtualRouterView />
  </div>
</template>

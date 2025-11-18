<script setup lang="ts">
import { onViteRpcConnected, viteRpc } from '@vue/devtools-core'
import { Network } from 'vis-network'

async function fetchGraph() {
  const root = await viteRpc.value.getRoot().then(res => res)
  viteRpc.value.getGraphModules().then((res) => {
    parseGraphRawData(res, root)
  })
}

function onModuleUpdated() {
  fetchGraph()
}

onViteRpcConnected(() => {
  fetchGraph()
  viteRpc.functions.on('graphModuleUpdated', onModuleUpdated)
})

const container = ref<HTMLDivElement>()
const networkRef = shallowRef<Network>()
const showStabilizingModal = ref(false)

function mountNetwork() {
  const node = container.value!

  const network = networkRef.value = new Network(node, { nodes: graphNodes, edges: graphEdges }, graphOptions.value)

  watch(graphOptions, (options) => {
    network.setOptions(options)
  }, { immediate: true })

  network.on('selectNode', (options) => {
    updateGraphDrawerData(options.nodes[0])
    toggleGraphDrawer(true)
  })

  network.on('startStabilizing', () => {
    if (devtoolsClientState.value.reduceMotion)
      showStabilizingModal.value = true
  })
  network.on('stabilized', () => {
    showStabilizingModal.value = false
  })

  network.on('deselectNode', () => {
    toggleGraphDrawer(false)
  })

  watch(() => graphFilterNodeId.value, (id) => {
    if (id)
      network.moveTo({ position: { x: 0, y: 0 } })
  })
}

onMounted(() => {
  mountNetwork()
})

onUnmounted(() => {
  cleanupGraphRelatedStates()
  networkRef.value?.destroy()
  viteRpc.functions.off('graphModuleUpdated', onModuleUpdated)
})

const navbarRef = ref<HTMLElement>()
</script>

<template>
  <div flex="~ col" relative h-full of-hidden panel-grids class="graph-body">
    <GraphNavbar ref="navbarRef" />
    <div class="relative flex-1">
      <div ref="container" class="absolute inset-0" />
      <div v-if="showStabilizingModal" class="absolute inset-0 flex select-none items-center justify-center bg-base text-base">
        <div class="flex items-center space-x-2">
          <span>Stabilizing...</span>
        </div>
      </div>
      <GraphFileType />
      <GraphDrawer :top="navbarRef" />
    </div>
  </div>
</template>

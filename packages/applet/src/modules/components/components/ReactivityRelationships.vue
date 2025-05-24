<script setup lang="ts">
import type { CustomInspectorState, ReactivityGraphNode, ReactivityRelationship } from '@vue/devtools-kit'
import { Network } from 'vis-network'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { buildReactivityGraph, graphEdges, graphNodes, graphOptions } from '~/composables/reactivity-relationship'

const props = defineProps<{
  state: CustomInspectorState[]
  nodes: ReactivityGraphNode[]
  relationships: ReactivityRelationship[]
}>()

const emit = defineEmits(['close'])
const container = ref<HTMLDivElement>()
const networkRef = shallowRef<Network>()

function close() {
  emit('close')
}

function mountNetwork() {
  const node = container.value!
  networkRef.value = new Network(node, { nodes: graphNodes, edges: graphEdges }, graphOptions.value)

  const network = networkRef.value
  watch(graphOptions, (options) => {
    network?.setOptions(options)
  }, { immediate: true })

  network.on('selectNode', (options) => {
    console.log(options)
  })

  network.on('startStabilizing', () => {
    console.log('startStabilizing')
  })

  network.on('stabilized', () => {
    console.log('stabilized')
  })

  network.on('deselectNode', () => {
    console.log('deselectNode')
  })
}

watch([() => props.nodes, () => props.relationships], () => {
  buildReactivityGraph(props.nodes, props.relationships)
  mountNetwork()
}, {
  deep: true,
})

onMounted(() => {
  buildReactivityGraph(props.nodes, props.relationships)
  mountNetwork()
})

onUnmounted(() => {
  networkRef.value?.destroy()
})
</script>

<template>
  <div class="absolute left-0 top-0 h-full w-full flex flex-col rounded-br-2.5 rounded-tr-2.5 bg-white p2 dark:bg-#121212">
    <div class="h-12 w-full flex items-center justify-between p-2">
      <span class="font-500">Reactivity Relationship</span>
      <i class="i-carbon-close cursor-pointer hover:op80" @click="close" />
    </div>
    <div class="flex-1 overflow-scroll text-3.5">
      <div class="relative h-full w-full flex-1">
        <div ref="container" class="absolute inset-0" />
      </div>
    </div>
  </div>
</template>

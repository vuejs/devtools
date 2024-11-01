<script setup lang="ts">
import type { CustomInspectorNode, CustomInspectorState } from '@vue/devtools-kit'
import { DevToolsMessagingEvents, rpc } from '@vue/devtools-core'
import { parse } from '@vue/devtools-kit'
import { until } from '@vueuse/core'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, onUnmounted, ref, watch } from 'vue'
import DevToolsHeader from '~/components/basic/DevToolsHeader.vue'
import Empty from '~/components/basic/Empty.vue'
import Navbar from '~/components/basic/Navbar.vue'
import RootStateViewer from '~/components/state/RootStateViewer.vue'
import ComponentTree from '~/components/tree/TreeViewer.vue'
import { useCustomInspectorState } from '~/composables/custom-inspector-state'
import { createExpandedContext } from '~/composables/toggle-expanded'

const { expanded: expandedTreeNodes } = createExpandedContext()
const { expanded: expandedStateNodes } = createExpandedContext('routes-state')

const customInspectState = useCustomInspectorState()

const inspectorId = computed(() => customInspectState.value.id!)

const selected = ref('')
const tree = ref<CustomInspectorNode[]>([])
const treeNodeLinkedList = computed(() => tree.value?.length ? dfs(tree.value?.[0]) : [])
const flattenedTreeNodes = computed(() => flattenTreeNodes(tree.value))
const flattenedTreeNodesIds = computed(() => flattenedTreeNodes.value.map(node => node.id))
const state = ref<Record<string, CustomInspectorState[]>>({})

// tree
function dfs(node: { id: string, children?: { id: string }[] }, path: string[] = [], linkedList: string[][] = []) {
  path.push(node.id)
  if (node.children?.length === 0)
    linkedList.push([...path])

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => {
      dfs(child, path, linkedList)
    })
  }

  path.pop()
  return linkedList
}

function getNodesByDepth(list: string[][], depth: number) {
  const nodes: string[] = []
  list?.forEach((item) => {
    nodes.push(...item.slice(0, depth + 1))
  })
  return [...new Set(nodes)]
}

function flattenTreeNodes(tree: CustomInspectorNode[]) {
  const res: CustomInspectorNode[] = []
  const find = (treeNode: CustomInspectorNode[]) => {
    treeNode?.forEach((item) => {
      res.push(item)
      if (item.children?.length)
        find(item.children)
    })
  }
  find(tree)
  return res
}

function filterEmptyState(data: Record<string, unknown[] | string | undefined>) {
  for (const key in data) {
    if (!data[key]?.length)
      delete data[key]
  }
  return data
}

function getRoutesState(nodeId: string) {
  rpc.value.getInspectorState({ inspectorId: inspectorId.value, nodeId }).then((data) => {
    const parsedData = parse(data!)
    if (!parsedData)
      return
    // @ts-expect-error skip type check
    state.value = filterEmptyState(parsedData)
    expandedStateNodes.value = Array.from({ length: Object.keys(state.value).length }, (_, i) => `${i}`)
  })
}

function clearRoutesState() {
  state.value = {}
}

watch(selected, () => {
  clearRoutesState()
  getRoutesState(selected.value)
})

const getRoutesInspectorTree = () => {
  rpc.value.getInspectorTree({ inspectorId: inspectorId.value, filter: '' }).then((_data) => {
    const data = parse(_data!)
    tree.value = data
    if (!selected.value && data.length) {
      selected.value = data[0].id
      getRoutesState(data[0].id)
      expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
    }
  })
}

until(inspectorId).toBeTruthy().then(getRoutesInspectorTree)

function onInspectorTreeUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    rootNodes: CustomInspectorNode[]
  }
  if (data.inspectorId !== inspectorId.value || !data.rootNodes.length)
    return
  tree.value = data.rootNodes as unknown as CustomInspectorNode[]
  if (!flattenedTreeNodesIds.value.includes(selected.value)) {
    selected.value = data.rootNodes[0].id
    expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
    getRoutesState(data.rootNodes[0].id)
  }
}

function onInspectorStateUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    state: CustomInspectorState
    nodeId: string
  }

  if (data.inspectorId !== inspectorId.value)
    return

  const _state = data.state

  // @ts-expect-error skip type check
  state.value = filterEmptyState(_state!)
}

rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)

rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)

onUnmounted(() => {
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <DevToolsHeader doc-link="https://router.vuejs.org/" github-repo-link="https://github.com/vuejs/router">
      <Navbar />
    </DevToolsHeader>
    <Splitpanes class="flex-1 overflow-auto">
      <Pane border="r base" size="40" h-full>
        <div h-full select-none overflow-scroll p2 class="no-scrollbar">
          <ComponentTree v-model="selected" :data="tree" />
        </div>
      </Pane>
      <Pane size="60">
        <div h-full overflow-scroll class="no-scrollbar">
          <RootStateViewer v-if="selected" class="p3" :data="state" node-id="" inspector-id="router" expanded-state-id="routes-state" />
          <Empty v-else>
            No Data
          </Empty>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import type { CustomInspectorNode, CustomInspectorOptions, CustomInspectorState } from '@vue/devtools-kit'
import { DevToolsMessagingEvents, onRpcConnected, rpc } from '@vue/devtools-core'
import { parse } from '@vue/devtools-kit'
import { vTooltip, VueIcIcon, VueInput } from '@vue/devtools-ui'
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
import { filterInspectorState } from '~/utils'

const { expanded: expandedTreeNodes } = createExpandedContext()
const { expanded: expandedStateNodes } = createExpandedContext('custom-inspector-state')

const customInspectState = useCustomInspectorState()

const inspectorId = computed(() => customInspectState.value.id!)
const nodeActions = ref<CustomInspectorOptions['nodeActions']>([])
const actions = ref<CustomInspectorOptions['nodeActions']>([])

const tree = ref<CustomInspectorNode[]>([])
const treeNodeLinkedList = computed(() => tree.value?.length ? dfs(tree.value?.[0]) : [])
const flattenedTreeNodes = computed(() => flattenTreeNodes(tree.value))
const flattenedTreeNodesIds = computed(() => flattenedTreeNodes.value.map(node => node.id))
const selected = ref('')

const state = ref<Record<string, CustomInspectorState[]>>({})
const emptyState = computed(() => !Object.keys(state.value).length)

const inspectorState = useCustomInspectorState()

const filterTreeKey = ref('')
const filterStateKey = ref('')

watch(filterTreeKey, (value, oldValue) => {
  if (!value.trim().length && !oldValue.trim().length)
    return
  getInspectorTree(value)
})

const displayState = computed(() => {
  return filterInspectorState({
    state: state.value,
    filterKey: filterStateKey.value,
  })
})

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

function getNodeActions() {
  rpc.value.getInspectorNodeActions(inspectorId.value).then((actions) => {
    nodeActions.value = actions
  })
}

function getActions() {
  rpc.value.getInspectorActions(inspectorId.value).then((_actions) => {
    actions.value = _actions
  })
}

getNodeActions()

getActions()

function callNodeAction(index: number) {
  rpc.value.callInspectorNodeAction(inspectorId.value, index, selected.value)
}

function callAction(index: number) {
  rpc.value.callInspectorAction(inspectorId.value, index)
}

function filterEmptyState(data: Record<string, CustomInspectorState[]>) {
  for (const key in data) {
    if (!data[key]?.length)
      delete data[key]
  }
  return data
}

function getInspectorState(nodeId: string) {
  rpc.value.getInspectorState({ inspectorId: inspectorId.value, nodeId }).then((data) => {
    const parsedData = parse(data!)
    if (!parsedData)
      return
    state.value = filterEmptyState(parsedData)
    expandedStateNodes.value = Array.from({ length: Object.keys(state.value).length }, (_, i) => `${i}`)
  })
}

function clearInspectorState() {
  state.value = {}
}

watch(selected, () => {
  clearInspectorState()
  getInspectorState(selected.value)
})

function getInspectorTree(filter = '') {
  rpc.value.getInspectorTree({ inspectorId: inspectorId.value, filter }).then((_data) => {
    const data = parse(_data!)
    tree.value = data
    if (!selected.value && data.length) {
      selected.value = data[0].id
      expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
      getInspectorState(data[0].id)
    }
  })
}

until(inspectorId).toBeTruthy().then(() => getInspectorTree())

function onInspectorTreeUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    rootNodes: CustomInspectorNode[]
  }
  if (!data.rootNodes.length || data.inspectorId !== inspectorId.value)
    return
  tree.value = data.rootNodes

  if (!flattenedTreeNodesIds.value.includes(selected.value)) {
    selected.value = tree.value?.[0]?.id
    expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
  }
}

function onInspectorStateUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    state: CustomInspectorState
    nodeId: string
  }
  if (data.inspectorId !== inspectorId.value || !data.state || data.nodeId !== selected.value)
    return

  const { inspectorId: _inspectorId, ...filtered } = data.state

  state.value = filterEmptyState(filtered as any)
}

onRpcConnected(() => {
  rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)
  rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)
})

onUnmounted(() => {
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <DevToolsHeader :doc-link="customInspectState.homepage!">
      <Navbar />
    </DevToolsHeader>
    <Empty v-if="!tree.length && !filterTreeKey.trim().length">
      No Data
    </Empty>
    <template v-else>
      <Splitpanes class="flex-1 overflow-auto">
        <Pane border="r base" size="40" h-full>
          <div class="h-full flex flex-col p2">
            <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
              <VueInput v-model="filterTreeKey" :placeholder="inspectorState.treeFilterPlaceholder" />
              <div v-if="actions?.length" class="flex items-center gap-2 px-1">
                <div v-for="(action, index) in actions" :key="index" v-tooltip.bottom-end="{ content: action.tooltip }" class="flex items-center gap1" @click="callAction(index)">
                  <VueIcIcon :name="`baseline-${action.icon.replace(/\_/g, '-')}`" cursor-pointer op70 text-base hover:op100 />
                </div>
              </div>
            </div>
            <div v-if="tree.length" class="no-scrollbar flex-1 select-none overflow-scroll">
              <ComponentTree v-model="selected" :data="tree" />
            </div>
            <Empty v-else>
              No Data
            </Empty>
          </div>
        </Pane>
        <Pane size="60">
          <div class="h-full flex flex-col p2">
            <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
              <VueInput v-model="filterStateKey" :placeholder="inspectorState.stateFilterPlaceholder" />
              <div v-if="nodeActions?.length" class="flex items-center gap-2 px-1">
                <div v-for="(action, index) in nodeActions" :key="index" v-tooltip.bottom-end="{ content: action.tooltip }" class="flex items-center gap1" @click="callNodeAction(index)">
                  <VueIcIcon :name="`baseline-${action.icon.replace(/\_/g, '-')}`" cursor-pointer op70 text-base hover:op100 />
                </div>
              </div>
            </div>
            <RootStateViewer v-if="selected && !emptyState" :data="displayState" :node-id="selected" :inspector-id="inspectorId" expanded-state-id="custom-inspector-state" class="no-scrollbar flex-1 overflow-scroll" />
            <Empty v-else>
              No Data
            </Empty>
          </div>
        </Pane>
      </Splitpanes>
    </template>
  </div>
</template>

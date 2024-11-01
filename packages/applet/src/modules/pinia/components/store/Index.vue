<script setup lang="ts">
import type { CustomInspectorNode, CustomInspectorOptions, CustomInspectorState } from '@vue/devtools-kit'
import { DevToolsMessagingEvents, rpc } from '@vue/devtools-core'
import { parse } from '@vue/devtools-kit'
import { vTooltip, VueInput } from '@vue/devtools-ui'
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
import { PiniaPluginInspectorId } from '../../constants'

const { expanded: expandedTreeNodes } = createExpandedContext()
const { expanded: expandedStateNodes } = createExpandedContext('pinia-store-state')

const inspectorId = PiniaPluginInspectorId
const nodeActions = ref<CustomInspectorOptions['nodeActions']>([])
const actions = ref<CustomInspectorOptions['nodeActions']>([])
const inspectorState = useCustomInspectorState()

const selected = ref('')
const tree = ref<CustomInspectorNode[]>([])
const treeNodeLinkedList = computed(() => tree.value?.length ? dfs(tree.value?.[0]) : [])
const flattenedTreeNodes = computed(() => flattenTreeNodes(tree.value))
const flattenedTreeNodesIds = computed(() => flattenedTreeNodes.value.map(node => node.id))
const state = ref<Record<string, CustomInspectorState[]>>({})
const filterStoreKey = ref('')
const filterStateKey = ref('')

watch(filterStoreKey, (value, oldValue) => {
  if (!value.trim().length && !oldValue.trim().length)
    return
  getPiniaInspectorTree(value)
})

const displayState = computed(() => {
  return filterInspectorState({
    state: state.value,
    filterKey: filterStateKey.value,
  })
})

const emptyState = computed(() => !state.value.state?.length && !state.value.getters?.length)

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
  rpc.value.getInspectorNodeActions(inspectorId).then((actions) => {
    nodeActions.value = actions
  })
}

function getActions() {
  rpc.value.getInspectorActions(inspectorId).then((_actions) => {
    actions.value = _actions
  })
}

getNodeActions()

getActions()

function callNodeAction(index: number) {
  rpc.value.callInspectorNodeAction(inspectorId, index, selected.value)
}

function callAction(index: number) {
  rpc.value.callInspectorAction(inspectorId, index)
}

function filterEmptyState(data: Record<string, unknown[] | undefined>) {
  for (const key in data) {
    if (!data[key]?.length)
      delete data[key]
  }
  return data
}

function getPiniaState(nodeId: string) {
  rpc.value.getInspectorState({ inspectorId, nodeId }).then((data) => {
    const parsedData = parse(data!)
    if (!parsedData)
      return
    // @ts-expect-error skip type check
    state.value = filterEmptyState(parsedData)
    expandedStateNodes.value = Array.from({ length: Object.keys(state.value).length }, (_, i) => `${i}`)
  })
}

function clearPiniaState() {
  state.value = {}
}

watch(selected, () => {
  clearPiniaState()
  getPiniaState(selected.value)
})

function getPiniaInspectorTree(filter: string = '') {
  rpc.value.getInspectorTree({ inspectorId, filter }).then((_data) => {
    const data = parse(_data!)
    tree.value = data
    if (!selected.value && data.length) {
      selected.value = data[0].id
      getPiniaState(data[0].id)
      expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
    }
  })
}
getPiniaInspectorTree()

function onInspectorTreeUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    rootNodes: CustomInspectorNode[]
  }
  if (data.inspectorId !== inspectorId || !data.rootNodes.length)
    return
  tree.value = data.rootNodes as unknown as CustomInspectorNode[]

  if (!flattenedTreeNodesIds.value.includes(selected.value)) {
    selected.value = data.rootNodes[0].id
    expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
    getPiniaState(data.rootNodes[0].id)
  }
}

function onInspectorStateUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    state: CustomInspectorState
    nodeId: string
  }

  if (data.inspectorId !== inspectorId)
    return

  const _state = data.state

  // @ts-expect-error skip type check
  state.value = filterEmptyState({
    state: _state.state,
    getters: _state.getters,
  })
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
    <DevToolsHeader doc-link="https://pinia.vuejs.org/" github-repo-link="https://github.com/vuejs/pinia">
      <Navbar />
    </DevToolsHeader>
    <Splitpanes class="flex-1 overflow-auto">
      <Pane border="r base" size="40" h-full>
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStoreKey" :placeholder="inspectorState.treeFilterPlaceholder" />
            <div v-if="actions?.length" class="flex items-center gap-2 px-1">
              <div v-for="(action, index) in actions" :key="index" v-tooltip.bottom-end="{ content: action.tooltip }" class="flex items-center gap1" @click="callAction(index)">
                <i :class="`i-ic-baseline-${action.icon.replace(/\_/g, '-')}`" cursor-pointer op70 text-base hover:op100 />
              </div>
            </div>
          </div>
          <div class="no-scrollbar flex-1 select-none overflow-scroll">
            <ComponentTree v-model="selected" :data="tree" />
          </div>
        </div>
      </Pane>
      <Pane size="60">
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStateKey" :placeholder="inspectorState.stateFilterPlaceholder" />
            <div v-if="nodeActions?.length" class="flex items-center gap-2 px-1">
              <div v-for="(action, index) in nodeActions" :key="index" v-tooltip.bottom-end="{ content: action.tooltip }" class="flex items-center gap1" @click="callNodeAction(index)">
                <i :class="`i-ic-baseline-${action.icon.replace(/\_/g, '-')}`" cursor-pointer op70 text-base hover:op100 />
              </div>
            </div>
          </div>
          <RootStateViewer v-if="selected && !emptyState" class="no-scrollbar flex-1 overflow-scroll" :data="displayState" :node-id="selected" :inspector-id="inspectorId" expanded-state-id="pinia-store-state" />
          <Empty v-else>
            No Data
          </Empty>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

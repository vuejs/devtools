<script setup lang="ts">
import type { CustomInspectorNode, CustomInspectorState } from '@vue/devtools-kit'
import {
  DevToolsMessagingEvents,
  rpc,
  useDevToolsState,
} from '@vue/devtools-core'
import { parse } from '@vue/devtools-kit'
import { isInChromePanel, isInSeparateWindow, sortByKey } from '@vue/devtools-shared'
import { vTooltip, VueButton, VueDialog, VueInput } from '@vue/devtools-ui'
import { useElementSize, useEventListener, useToggle, watchDebounced } from '@vueuse/core'
import { flatten, groupBy } from 'lodash-es'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue'
import SelectiveList from '~/components/basic/SelectiveList.vue'
import RootStateViewer from '~/components/state/RootStateViewer.vue'
import ComponentTree from '~/components/tree/TreeViewer.vue'
import { useComponentHighlight } from '~/composables/component-highlight'
import { createSelectedContext } from '~/composables/select'
import { createExpandedContext } from '~/composables/toggle-expanded'
import { filterInspectorState } from '~/utils'
import ComponentRenderCode from './components/RenderCode.vue'

const emit = defineEmits(['openInEditor', 'onInspectComponentStart', 'onInspectComponentEnd'])
// responsive layout
const splitpanesRef = ref<HTMLDivElement>()
const splitpanesReady = ref(false)
const { width: splitpanesWidth } = useElementSize(splitpanesRef)
// prevent `Splitpanes` layout from being changed before it ready
const horizontal = computed(() => splitpanesReady.value ? splitpanesWidth.value < 700 : false)
const filterComponentName = ref('')
const filterStateName = ref('')
const [filtered, toggleFiltered] = useToggle(true)
const componentTreeLoaded = ref(false)
const inspectComponentTipVisible = ref(false)
const componentRenderCode = ref('')
const componentRenderCodeVisible = ref(false)
const highlighter = useComponentHighlight()

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

function getNodesByDepth(list: string[][], depth: number) {
  const nodes: string[] = []
  list?.forEach((item) => {
    nodes.push(...item.slice(0, depth + 1))
  })
  return [...new Set(nodes)]
}

function getTargetLinkedNodes(list: string[][], target: string) {
  const nodes: string[] = []
  list.forEach((item) => {
    const index = item.indexOf(target)
    if (index !== -1)
      nodes.push(...item.slice(0, index + 1))
  })
  return [...new Set(nodes)]
}

const inspectorId = 'components'
const tree = ref<Array<CustomInspectorNode>>([])
const treeNodeLinkedList = computed(() => tree.value?.length ? dfs(tree.value?.[0]) : [])
const flattenedTreeNodes = computed(() => flattenTreeNodes(tree.value))
const flattenedTreeNodesIds = computed(() => flattenedTreeNodes.value.map(node => node.id))
const activeComponentState = ref<Record<string, any[]>>({})
const activeComponentId = ref('')
const activeTreeNode = computed(() => {
  const res: CustomInspectorNode[] = []
  const find = (treeNode: CustomInspectorNode[]) => {
    treeNode.forEach((item) => {
      if (item.id === activeComponentId.value)
        res.push(item)
      if (item.children?.length)
        find(item.children)
    })
  }
  find(tree.value)
  return res[0]
})
const activeTreeNodeFilePath = computed(() => activeTreeNode.value?.file ?? '')

const displayState = computed(() => {
  return filterInspectorState({
    state: activeComponentState.value,
    filterKey: filterStateName.value,
    processGroup(groupFields) {
      return flatten(Object.values(groupBy(sortByKey(groupFields), 'stateType')))
    },
  })
})

const { expanded: expandedTreeNodes } = createExpandedContext()
const { expanded: expandedStateNodes } = createExpandedContext('component-state')
createSelectedContext()

async function getComponentsInspectorTree(filter = '') {
  return rpc.value.getInspectorTree({ inspectorId, filter }).then((data) => {
    const res = parse(data)
    tree.value = res
    activeComponentId.value = tree.value?.[0]?.id
    expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
    componentTreeLoaded.value = true
  })
}

function normalizeComponentState(data: { state?: any[] }) {
  if (!data || !data?.state)
    return {}
  const res = {}
  data.state.forEach((item) => {
    if (!res[item.type])
      res[item.type] = []
    res[item.type].push(item)
  })
  return res
}

function getComponentState(id: string) {
  rpc.value.getInspectorState({ inspectorId, nodeId: id }).then((data) => {
    const parsedData = parse(data!)
    if (!parsedData)
      return
    activeComponentState.value = normalizeComponentState(parsedData)
    expandedStateNodes.value = Array.from({ length: Object.keys(activeComponentState.value).length }, (_, i) => `${i}`)
  })
}

watch(activeComponentId, (id) => {
  getComponentState(id)
  if (componentRenderCodeVisible.value) {
    getComponentRenderCode()
  }
})

function onInspectorStateUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    state: CustomInspectorState
    nodeId: string
  }
  if (data.inspectorId !== inspectorId || data.nodeId !== activeComponentId.value)
    return

  activeComponentState.value = normalizeComponentState({ state: data.state.state })
}

rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)

getComponentsInspectorTree()

function searchComponentTree(v: string) {
  const value = v.trim().toLowerCase()
  toggleFiltered()
  getComponentsInspectorTree(value).then(() => {
    toggleFiltered()
  })
}

watchDebounced(filterComponentName, (v) => {
  searchComponentTree(v)
}, { debounce: 300 })

function onInspectorTreeUpdated(_data: string) {
  const data = parse(_data) as {
    inspectorId: string
    rootNodes: CustomInspectorNode[]
  }
  if (data.inspectorId !== inspectorId)
    return

  if (filterComponentName.value) {
    searchComponentTree(filterComponentName.value)
  }
  else {
    tree.value = data.rootNodes
  }

  if (!flattenedTreeNodesIds.value.includes(activeComponentId.value)) {
    activeComponentId.value = tree.value?.[0]?.id
    expandedTreeNodes.value = getNodesByDepth(treeNodeLinkedList.value, 1)
  }
}

rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)

onUnmounted(() => {
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, onInspectorStateUpdated)
  rpc.functions.off(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, onInspectorTreeUpdated)
})

// #region toggle app
const devtoolsState = useDevToolsState()
const appRecords = computed(() => devtoolsState.appRecords.value.map(app => ({
  label: app.name + (app.version ? ` (${app.version})` : ''),
  value: app.id,
})))

const normalizedAppRecords = computed(() => appRecords.value.map(app => ({
  label: app.label,
  id: app.value,
})))

const activeAppRecordId = ref(devtoolsState.activeAppRecordId.value)
watchEffect(() => {
  activeAppRecordId.value = devtoolsState.activeAppRecordId.value
})

async function toggleApp(id: string) {
  await rpc.value.toggleApp(id)
  activeComponentId.value = ''
  await getComponentsInspectorTree()
}
// #endregion

async function inspectComponentInspector() {
  inspectComponentTipVisible.value = true
  emit('onInspectComponentStart')

  try {
    const data = JSON.parse(await rpc.value.inspectComponentInspector())

    const appId = data.id.split(':')[0]
    if (activeAppRecordId.value !== data.appId) {
      await toggleApp(appId)
    }

    activeComponentId.value = data.id
    if (!expandedTreeNodes.value.includes(data.id)) {
      expandedTreeNodes.value.push(data.id)
    }

    expandedTreeNodes.value = [...new Set([...expandedTreeNodes.value, ...getTargetLinkedNodes(treeNodeLinkedList.value, data.id)])]
    scrollToActiveTreeNode()
  }
  finally {
    inspectComponentTipVisible.value = false
    emit('onInspectComponentEnd')
  }
}

function cancelInspectComponentInspector() {
  inspectComponentTipVisible.value = false
  rpc.value.cancelInspectComponentInspector()
}

useEventListener('keydown', (event) => {
  if ((event.key === 's') && (event.ctrlKey || event.metaKey) && !inspectComponentTipVisible.value) {
    inspectComponentInspector()
  }
  else if (event.key === 'Escape' && inspectComponentTipVisible.value) {
    cancelInspectComponentInspector()
  }
})

function scrollToComponent() {
  rpc.value.scrollToComponent(activeComponentId.value)
}

function inspectDOM() {
  rpc.value.inspectDOM(activeComponentId.value).then(() => {
    // @ts-expect-error skip type check
    chrome.devtools.inspectedWindow.eval('inspect(window.__VUE_DEVTOOLS_INSPECT_DOM_TARGET__)')
  })
}

function getComponentRenderCode() {
  rpc.value.getComponentRenderCode(activeComponentId.value).then((data) => {
    componentRenderCode.value = data!
    componentRenderCodeVisible.value = true
  })
}

function openInEditor() {
  emit('openInEditor', activeTreeNodeFilePath.value)
}

const componentTreeContainer = ref<HTMLDivElement>()
function scrollToActiveTreeNode() {
  setTimeout(() => {
    const selected = componentTreeContainer.value?.querySelector('.active')
    selected?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 300)
}

function closeComponentRenderCode() {
  componentRenderCode.value = ''
  componentRenderCodeVisible.value = false
}
</script>

<template>
  <div class="h-full w-full">
    <Splitpanes ref="splitpanesRef" class="flex-1 overflow-auto" :horizontal="horizontal" @ready="splitpanesReady = true">
      <Pane v-if="appRecords.length > 1" border="base h-full" size="20">
        <div class="no-scrollbar h-full flex select-none gap-2 overflow-scroll">
          <SelectiveList v-model="activeAppRecordId" :data="normalizedAppRecords" class="w-full" @select="toggleApp" />
        </div>
      </Pane>
      <Pane border="base" h-full>
        <div v-if="componentTreeLoaded" class="h-full flex flex-col p2">
          <div class="flex py2">
            <VueInput v-model="filterComponentName" :loading-debounce-time="250" :loading="!filtered" placeholder="Find components..." class="flex-1 text-3.5" />
            <button v-if="!isInSeparateWindow" v-tooltip.bottom="'Select component in the page'" px-1 class="hover:(color-#00dc82)" @click="inspectComponentInspector">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                style="height: 1.1em; width: 1.1em;"
                class="op-80 hover:(op-100)"
                viewBox="0 0 24 24"
              >
                <path fill="currentColor" d="M10.611 10.611a1 1 0 0 1 1.11-.208l8.839 3.889a1 1 0 0 1-.14 1.88l-3.338.91l-.91 3.338a1 1 0 0 1-1.88.14l-3.89-8.84a1 1 0 0 1 .209-1.109M17 3a3 3 0 0 1 3 3v3a1 1 0 1 1-2 0V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3a1 1 0 1 1 0 2H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-3.73 10.269l1.715 3.9l.318-1.164a1 1 0 0 1 .701-.702l1.165-.318l-3.9-1.716Z" />
              </svg>
            </button>
          </div>
          <div ref="componentTreeContainer" class="no-scrollbar flex-1 select-none overflow-scroll">
            <ComponentTree v-model="activeComponentId" :data="tree" :with-tag="true" @hover="highlighter.highlight" @leave="highlighter.unhighlight" />
          </div>
        </div>
      </Pane>
      <Pane relative h-full>
        <div class="h-full flex flex-col p2">
          <div class="flex py2">
            <!-- component name -->
            <span v-if="activeTreeNode?.name" class="font-state-field flex items-center px-1 text-3.5">
              <span class="text-gray-400 dark:text-gray-600">&lt;</span>
              <span group-hover:text-white class="max-w-40 of-hidden text-ellipsis ws-nowrap [.active_&]:(text-white)">{{ activeTreeNode.name }}</span>
              <span class="text-gray-400 dark:text-gray-600">&gt;</span>
            </span>

            <VueInput v-model="filterStateName" :loading-debounce-time="250" placeholder="Filter State..." class="flex-1 text-3.5" />

            <div class="flex items-center gap-2 px-1">
              <i v-tooltip.bottom="'Scroll to component'" class="i-material-symbols-light:eye-tracking-outline h-4 w-4 cursor-pointer hover:(op-70)" @click="scrollToComponent" />
              <i v-tooltip.bottom="'Show render code'" class="i-material-symbols-light:code h-5 w-5 cursor-pointer hover:(op-70)" @click="getComponentRenderCode" />
              <i v-if="isInChromePanel" v-tooltip.bottom="'Inspect DOM'" class="i-material-symbols-light:menu-open h-5 w-5 cursor-pointer hover:(op-70)" @click="inspectDOM" />
              <i v-if="activeTreeNodeFilePath" v-tooltip.bottom="'Open in Editor'" class="i-carbon-launch h-4 w-4 cursor-pointer hover:(op-70)" @click="openInEditor" />
            </div>
          </div>
          <RootStateViewer class="no-scrollbar flex-1 overflow-scroll" :data="displayState" :node-id="activeComponentId" :inspector-id="inspectorId" expanded-state-id="component-state" />
        </div>
        <ComponentRenderCode v-if="componentRenderCodeVisible && componentRenderCode" :code="componentRenderCode" @close="closeComponentRenderCode" />
      </Pane>
    </Splitpanes>

    <!-- inspect-component dialog -->
    <VueDialog v-if="isInChromePanel" v-model="inspectComponentTipVisible" title="" height="12rem" :closable="false">
      <div class="h-full flex flex-col items-center justify-center gap-2">
        <span class="block">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            style="height: 2em; width: 2em; opacity:0.5;color:#00dc82;"
            class="animate-fade"
            viewBox="0 0 24 24"
          >
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r=".5" fill="currentColor" /><path d="M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0m7-9v2m-9 7h2m7 7v2m7-9h2" /></g>
          </svg>
        </span>
        <p>
          Click on a component on the page to select it
        </p>
      </div>
      <template #footer>
        <div class="flex items-center justify-center">
          <VueButton @click="cancelInspectComponentInspector">
            Cancel
          </VueButton>
        </div>
      </template>
    </VueDialog>
  </div>
</template>

<style scoped>
@keyframes fade {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.animate-fade {
  animation: fade 2s infinite alternate;
}
</style>

<script setup lang="ts">
import type { ComponentStateSnapshotMessage } from '@vue/devtools-kit'
import type {
  CustomInspectorSnapshot,
  CustomInspectorTreeNode,
} from '../../composables/devtools-client'
import AppList from '@components/components/AppList.vue'
import InspectorState from './InspectorState.vue'
import InspectorTree from './InspectorTree.vue'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDevtoolsClient } from '../../composables/devtools-client'

const SELECTED_NODES_STORAGE = 'vue-devtools-next:custom-inspector:selected-nodes'

const props = defineProps<{ inspector: CustomInspectorSnapshot }>()

const {
  apps,
  callInspectorAction,
  callInspectorNodeAction,
  clearExpandedValues,
  connected,
  error,
  fetchInspectorState,
  fetchInspectorTree,
  inspectorInvalidations,
  selectInspectorNode,
  selectedAppId,
  runtimeVersion,
} = useDevtoolsClient()

const container = ref<HTMLElement>()
const horizontal = ref(false)
const treeFilter = ref('')
const stateFilter = ref('')
const selectedNodeId = ref('')
const tree = ref<CustomInspectorTreeNode[]>([])
const state = ref<ComponentStateSnapshotMessage>()
const treeLoading = ref(false)
const stateLoading = ref(false)

let observer: ResizeObserver | undefined
let treeRequest = 0
let stateRequest = 0

const inspectorId = computed(() => props.inspector.id)
const selectedNode = computed(() =>
  flattenTreeNodes(tree.value).find((node) => node.id === selectedNodeId.value),
)
const currentInvalidation = computed(() => {
  const id = inspectorId.value
  return id ? inspectorInvalidations.value[id] : undefined
})

watch(
  [inspectorId, selectedAppId, runtimeVersion, connected],
  () => {
    resetInspector()
    void refreshTree()
  },
  { immediate: true, flush: 'sync' },
)

watch(treeFilter, () => void refreshTree(), { flush: 'sync' })

watch(
  selectedNodeId,
  (nodeId) => {
    stateRequest++
    stateFilter.value = ''
    state.value = undefined
    stateLoading.value = false
    clearExpandedValues()
    if (nodeId) void refreshState(nodeId)
  },
  { flush: 'sync' },
)

watch(
  () => currentInvalidation.value?.tree,
  (version, previousVersion) => {
    if (version !== undefined && version !== previousVersion) void refreshTree()
  },
)

watch(
  () => currentInvalidation.value?.state,
  (version, previousVersion) => {
    if (version === undefined || version === previousVersion) return

    const invalidatedNodeId = currentInvalidation.value?.nodeId
    if (!invalidatedNodeId || invalidatedNodeId === selectedNodeId.value)
      void refreshState(selectedNodeId.value)
  },
)

async function refreshTree() {
  const id = inspectorId.value
  if (!id || !connected.value) return

  const request = ++treeRequest
  treeLoading.value = true
  try {
    const nodesSnapshot = await fetchInspectorTree(id, treeFilter.value)
    if (request !== treeRequest) return
    tree.value = nodesSnapshot
    const nodes = flattenTreeNodes(tree.value)
    const storedNodeId = readStoredSelectedNodeId(id)
    const nextSelectedNodeId = nodes.some((node) => node.id === selectedNodeId.value)
      ? selectedNodeId.value
      : storedNodeId && nodes.some((node) => node.id === storedNodeId)
        ? storedNodeId
        : (nodes[0]?.id ?? '')

    if (selectedNodeId.value !== nextSelectedNodeId) selectedNodeId.value = nextSelectedNodeId
    else if (nextSelectedNodeId) void refreshState(nextSelectedNodeId)

    persistSelectedNodeId(id, selectedNodeId.value)
  } catch (err) {
    if (request !== treeRequest) return
    tree.value = []
    state.value = undefined
    selectedNodeId.value = ''
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === treeRequest) treeLoading.value = false
  }
}

async function refreshState(nodeId: string | undefined) {
  const id = inspectorId.value
  if (!id || !nodeId || !connected.value) return

  const request = ++stateRequest
  stateLoading.value = true
  try {
    const snapshot = await fetchInspectorState(id, nodeId)
    if (request !== stateRequest) return
    clearExpandedValues()
    state.value = snapshot
  } catch (err) {
    if (request !== stateRequest) return
    state.value = undefined
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === stateRequest) stateLoading.value = false
  }
}

async function selectNode(nodeId: string) {
  const id = inspectorId.value
  if (!id || !connected.value) return

  selectedNodeId.value = nodeId
  persistSelectedNodeId(id, nodeId)
  await selectInspectorNode(id, nodeId)
}

async function runInspectorAction(actionIndex: number) {
  const id = inspectorId.value
  if (!id || !connected.value) return

  await callInspectorAction(id, actionIndex)
  await refreshTree()
}

async function runInspectorNodeAction(actionIndex: number) {
  const id = inspectorId.value
  const nodeId = selectedNodeId.value
  if (!id || !nodeId || !connected.value) return

  await callInspectorNodeAction(id, nodeId, actionIndex)
  await refreshState(nodeId)
}

function resetInspector() {
  treeRequest++
  stateRequest++
  treeLoading.value = false
  stateLoading.value = false
  clearExpandedValues()
  tree.value = []
  state.value = undefined
  selectedNodeId.value = ''
}

function flattenTreeNodes(nodes: CustomInspectorTreeNode[]): CustomInspectorTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTreeNodes(node.children ?? [])])
}

function readStoredSelectedNodeId(id: string): string | undefined {
  return readStoredSelections()[getSelectionScope(id)]
}

function persistSelectedNodeId(id: string, nodeId: string | undefined) {
  const selections = readStoredSelections()
  const scope = getSelectionScope(id)

  if (nodeId) selections[scope] = nodeId
  else delete selections[scope]

  writeStoredSelections(selections)
}

function getSelectionScope(id: string): string {
  return `${selectedAppId.value ?? 'default'}:${id}`
}

function readStoredSelections(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(SELECTED_NODES_STORAGE)
    if (!raw) return {}
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return {}

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function writeStoredSelections(selections: Record<string, string>) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SELECTED_NODES_STORAGE, JSON.stringify(selections))
  } catch {}
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    horizontal.value = entry.contentRect.width < 760
  })
  if (container.value) observer.observe(container.value)
})

onUnmounted(() => {
  treeRequest++
  stateRequest++
  observer?.disconnect()
})
</script>

<template>
  <section ref="container" class="h-full min-h-0">
    <Splitpanes class="h-full min-h-0 overflow-hidden" :horizontal="horizontal">
      <Pane v-if="apps.length > 1" class="h-full min-h-0" min-size="12" size="18">
        <AppList />
      </Pane>

      <Pane class="h-full min-h-0" min-size="22" :size="apps.length > 1 ? 34 : 40">
        <InspectorTree
          v-model:filter="treeFilter"
          :actions="inspector.actions"
          :loading="treeLoading"
          :nodes="tree"
          :placeholder="inspector.treeFilterPlaceholder ?? 'Search tree...'"
          :selected-node-id="selectedNodeId"
          :state-key="`${selectedAppId ?? 'default'}:${inspectorId ?? 'inspector'}`"
          @action="(index) => void runInspectorAction(index)"
          @refresh="() => void refreshTree()"
          @select="(nodeId) => void selectNode(nodeId)"
        />
      </Pane>

      <Pane class="h-full min-h-0" min-size="30">
        <InspectorState
          v-model:filter="stateFilter"
          :filter-placeholder="inspector.stateFilterPlaceholder ?? 'Filter state...'"
          :loading="stateLoading"
          :node-actions="inspector.nodeActions"
          :no-selection-text="inspector.noSelectionText ?? 'No node selected'"
          select-prompt="Select a node"
          :selected-node="selectedNode"
          :selected-node-id="selectedNodeId"
          :state="state"
          @node-action="(index) => void runInspectorNodeAction(index)"
        />
      </Pane>
    </Splitpanes>
  </section>
</template>

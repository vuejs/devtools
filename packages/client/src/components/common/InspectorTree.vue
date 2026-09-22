<script setup lang="ts">
import type { ComponentTreeNodeTag } from '../../composables/devtools-client'
import type { ComponentPublicInstance } from 'vue'
import DevtoolsIcon from './DevtoolsIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import RecycleScroller from 'vue-virtual-scroller/components/RecycleScroller'

interface InspectorTreeNode {
  id: string
  label: string
  children?: InspectorTreeNode[]
  hasChildren?: boolean
  tags?: ComponentTreeNodeTag[]
  renderKey?: string | number
  isFragment?: boolean
  inactive?: boolean
  favorite?: boolean
  duration?: string
}

interface InspectorTreeRow extends InspectorTreeNode {
  depth: number
  parentId?: string
  hasChildren: boolean
  isCollapsed: boolean
}

interface InspectorTreeAction {
  icon: string
  tooltip?: string
  ariaLabel?: string
  active?: boolean
  pressed?: boolean
  rounded?: 'sm' | 'full'
}

interface RecycleScrollerHandle {
  scrollToItem: (index: number) => void
}

const props = withDefaults(
  defineProps<{
    nodes: InspectorTreeNode[]
    selectedNodeId?: string
    filter: string
    loading?: boolean
    placeholder?: string
    loadingText?: string
    emptyText?: string
    noMatchingText?: string
    refreshTooltip?: string
    refreshAriaLabel?: string
    refreshVisible?: boolean
    actions?: InspectorTreeAction[]
    defaultExpandDepth?: number
    componentLabels?: boolean
    stateKey?: string
  }>(),
  {
    selectedNodeId: undefined,
    loading: false,
    placeholder: 'Search tree...',
    loadingText: 'Loading tree',
    emptyText: 'No nodes',
    noMatchingText: 'No matching nodes',
    refreshTooltip: 'Refresh inspector',
    refreshAriaLabel: 'Refresh inspector',
    refreshVisible: true,
    actions: () => [],
    defaultExpandDepth: 2,
    componentLabels: false,
    stateKey: 'default',
  },
)

const emit = defineEmits<{
  'update:filter': [value: string]
  action: [index: number]
  refresh: []
  select: [nodeId: string]
  hover: [nodeId: string]
  leave: []
  expand: [nodeId: string]
  collapse: [nodeId: string]
  toggleFavorite: [nodeId: string]
}>()

const treeContainer = ref<HTMLElement>()
const treeScroller = ref<RecycleScrollerHandle>()
const collapsedNodeIds = ref<Set<string>>(new Set())
const expandedNodeIds = ref<Set<string>>(new Set())
const filteredCollapsedNodeIds = ref<Set<string>>(new Set())
const filteredExpandedNodeIds = ref<Set<string>>(new Set())
const treeRowElements = new Map<string, HTMLElement>()

const TOOLTIP_ENTITY_VALUES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&#39;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
}

const treeRows = computed<InspectorTreeRow[]>(() => {
  const rows: InspectorTreeRow[] = []

  const visit = (node: InspectorTreeNode, depth: number, parentId?: string) => {
    const hasChildren = node.hasChildren ?? !!node.children?.length
    const isCollapsed = hasChildren && isTreeNodeCollapsed(node.id, depth)
    rows.push({ ...node, depth, parentId, hasChildren, isCollapsed })

    if (!hasChildren || isCollapsed) return
    node.children?.forEach((child) => visit(child, depth + 1, node.id))
  }

  props.nodes.forEach((node) => visit(node, 0))
  return rows
})
const emptyText = computed(() => (props.filter ? props.noMatchingText : props.emptyText))

watch(
  () => props.selectedNodeId,
  async (nodeId) => {
    if (nodeId) expandNodeAncestors(nodeId)
    await nextTick()
    await scrollSelectedTreeNodeIntoView()
  },
)

watch(
  () => props.stateKey,
  () => {
    collapsedNodeIds.value = new Set()
    expandedNodeIds.value = new Set()
    filteredCollapsedNodeIds.value = new Set()
    filteredExpandedNodeIds.value = new Set()
  },
)

watch([() => props.nodes, () => props.filter], () => {
  if (!props.filter.trim()) pruneTrackedNodeIds()
})

function updateFilter(event: Event) {
  emit('update:filter', event.target instanceof HTMLInputElement ? event.target.value : '')
}

function decodeTooltipEntities(value: string): string {
  return value.replace(
    /&(?:amp|apos|#39|gt|lt|quot);/g,
    (entity) => TOOLTIP_ENTITY_VALUES[entity] ?? entity,
  )
}

function selectTreeNode(nodeId: string) {
  emit('select', nodeId)
  void focusTreeRow(nodeId)
}

async function focusTreeRow(nodeId: string) {
  await nextTick()
  requestAnimationFrame(() => treeRowElements.get(nodeId)?.focus({ preventScroll: true }))
}

function onTreeKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return

  const rows = treeRows.value
  const index = rows.findIndex((node) => node.id === props.selectedNodeId)
  if (index === -1) return

  const selected = rows[index]
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (rows[index + 1]) selectTreeNode(rows[index + 1].id)
      break
    case 'ArrowUp':
      event.preventDefault()
      if (rows[index - 1]) selectTreeNode(rows[index - 1].id)
      break
    case 'ArrowRight':
      event.preventDefault()
      if (selected.hasChildren && selected.isCollapsed) setNodeCollapsed(selected, false)
      else if (selected.hasChildren && rows[index + 1]?.parentId === selected.id)
        selectTreeNode(rows[index + 1].id)
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (selected.hasChildren && !selected.isCollapsed) setNodeCollapsed(selected, true)
      else if (selected.parentId) selectTreeNode(selected.parentId)
      break
    case 'Home':
      event.preventDefault()
      if (rows[0]) selectTreeNode(rows[0].id)
      break
    case 'End':
      event.preventDefault()
      if (rows.at(-1)) selectTreeNode(rows.at(-1)!.id)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      emit('select', selected.id)
      break
  }
}

function toggleNodeCollapsed(node: InspectorTreeRow) {
  setNodeCollapsed(node, !node.isCollapsed)
}

function setNodeCollapsed(node: InspectorTreeRow, collapsedValue: boolean) {
  const filtering = !!props.filter.trim()
  const collapsed = new Set(filtering ? filteredCollapsedNodeIds.value : collapsedNodeIds.value)
  const expanded = new Set(filtering ? filteredExpandedNodeIds.value : expandedNodeIds.value)

  if (collapsedValue) {
    emit('collapse', node.id)
    collapsed.add(node.id)
    expanded.delete(node.id)
  } else {
    expanded.add(node.id)
    collapsed.delete(node.id)
    emit('expand', node.id)
  }

  if (filtering) {
    filteredCollapsedNodeIds.value = collapsed
    filteredExpandedNodeIds.value = expanded
  } else {
    collapsedNodeIds.value = collapsed
    expandedNodeIds.value = expanded
  }
}

function isTreeNodeCollapsed(nodeId: string, depth: number): boolean {
  if (props.filter.trim()) {
    if (filteredCollapsedNodeIds.value.has(nodeId)) return true
    if (filteredExpandedNodeIds.value.has(nodeId)) return false
    return false
  }
  if (collapsedNodeIds.value.has(nodeId)) return true
  if (expandedNodeIds.value.has(nodeId)) return false
  return depth >= props.defaultExpandDepth
}

function expandNodeAncestors(nodeId: string) {
  const path = findNodePath(props.nodes, nodeId)
  if (!path) return

  const collapsed = new Set(collapsedNodeIds.value)
  const expanded = new Set(expandedNodeIds.value)

  for (const node of path.slice(0, -1)) {
    collapsed.delete(node.id)
    expanded.add(node.id)
  }

  collapsedNodeIds.value = collapsed
  expandedNodeIds.value = expanded
}

function findNodePath(
  nodes: InspectorTreeNode[],
  nodeId: string,
  parents: InspectorTreeNode[] = [],
): InspectorTreeNode[] | undefined {
  for (const node of nodes) {
    const path = [...parents, node]
    if (node.id === nodeId) return path

    const childPath = findNodePath(node.children ?? [], nodeId, path)
    if (childPath) return childPath
  }
}

function pruneTrackedNodeIds() {
  const nodeIds = new Set<string>()
  collectNodeIds(props.nodes, nodeIds)
  collapsedNodeIds.value = intersectNodeIds(collapsedNodeIds.value, nodeIds)
  expandedNodeIds.value = intersectNodeIds(expandedNodeIds.value, nodeIds)
  filteredCollapsedNodeIds.value = intersectNodeIds(filteredCollapsedNodeIds.value, nodeIds)
  filteredExpandedNodeIds.value = intersectNodeIds(filteredExpandedNodeIds.value, nodeIds)
}

function collectNodeIds(nodes: InspectorTreeNode[], ids: Set<string>) {
  for (const node of nodes) {
    ids.add(node.id)
    collectNodeIds(node.children ?? [], ids)
  }
}

function intersectNodeIds(trackedIds: Set<string>, nodeIds: Set<string>): Set<string> {
  return new Set([...trackedIds].filter((id) => nodeIds.has(id)))
}

function setTreeRowElement(nodeId: string, element: Element | ComponentPublicInstance | null) {
  const htmlElement = resolveHtmlElement(element)
  if (htmlElement) treeRowElements.set(nodeId, htmlElement)
  else treeRowElements.delete(nodeId)
}

function resolveHtmlElement(
  element: Element | ComponentPublicInstance | null,
): HTMLElement | undefined {
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) return element
  const componentElement =
    element && '$el' in element ? (element.$el as Element | undefined) : undefined
  return typeof HTMLElement !== 'undefined' && componentElement instanceof HTMLElement
    ? componentElement
    : undefined
}

async function scrollSelectedTreeNodeIntoView() {
  const nodeId = props.selectedNodeId
  if (!nodeId) return
  const index = treeRows.value.findIndex((row) => row.id === nodeId)
  if (index >= 0) {
    treeScroller.value?.scrollToItem(index)
    await nextTick()
  }
  treeRowElements.get(nodeId)?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  })
}

function getTagStyle(tag: ComponentTreeNodeTag): Record<string, string> {
  return {
    ...(tag.textColor == null ? {} : { color: toCssColor(tag.textColor) }),
    ...(tag.backgroundColor == null ? {} : { backgroundColor: toCssColor(tag.backgroundColor) }),
  }
}

function toCssColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

function getActionButtonClass(action: InspectorTreeAction): string {
  if (action.rounded !== 'full') {
    return 'h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base'
  }

  if (action.active) {
    return 'h-7 w-7 shrink-0 rounded-full border-0 bg-primary-500/10 text-primary-700 flex items-center justify-center transition-colors hover:bg-primary-500/15 dark:bg-primary-300/10 dark:text-primary-300 dark:hover:bg-primary-300/15'
  }

  return 'h-7 w-7 shrink-0 rounded-full border-0 bg-transparent color-muted flex items-center justify-center transition-colors hover:bg-active'
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col p-2">
    <div class="shrink-0 flex items-center gap-2 py-2">
      <div
        class="group relative min-w-0 flex flex-1 items-center justify-between gap-0.5 overflow-hidden rounded-1 border border-primary-100 px-3 py-0.75 color-base dark:border-gray-700"
      >
        <input
          class="inspector-tree-search min-w-0 w-full border-0 bg-transparent p-0 outline-none text-3.5 color-inherit placeholder-color-gray-500 dark:placeholder-gray-300"
          :aria-label="placeholder"
          :placeholder="placeholder"
          :value="filter"
          type="search"
          @input="updateFilter"
        />
        <button
          v-if="filter"
          v-tooltip.bottom="'Clear filter'"
          class="h-6 w-6 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Clear filter"
          @click="emit('update:filter', '')"
        >
          <span class="i-carbon-close-large text-6" aria-hidden="true" />
        </button>
      </div>

      <button
        v-if="refreshVisible"
        v-tooltip.bottom="refreshTooltip"
        class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
        type="button"
        :aria-label="refreshAriaLabel"
        @click="emit('refresh')"
      >
        <span class="i-carbon-renew text-4" aria-hidden="true" />
      </button>

      <button
        v-for="(action, index) in actions"
        :key="`inspector-action-${index}`"
        v-tooltip.bottom="action.tooltip || 'Run action'"
        :class="getActionButtonClass(action)"
        type="button"
        :aria-label="action.ariaLabel || action.tooltip || 'Run inspector action'"
        :aria-pressed="action.pressed ?? action.active"
        @click="emit('action', index)"
      >
        <DevtoolsIcon :icon="action.icon" class="text-4" />
      </button>
    </div>

    <div
      ref="treeContainer"
      class="min-h-0 flex-1 outline-none"
      role="tree"
      @keydown="onTreeKeydown"
    >
      <div v-if="loading && !treeRows.length" class="p-6 text-center color-muted">
        {{ loadingText }}
      </div>

      <RecycleScroller
        v-else-if="treeRows.length"
        ref="treeScroller"
        class="h-full min-h-0 select-none overflow-auto pb-2"
        list-class="overflow-visible!"
        :items="treeRows"
        :item-size="24"
        key-field="id"
        :buffer="288"
        :prerender="24"
      >
        <template #default="{ item: node }">
          <div
            :ref="(element) => setTreeRowElement(node.id, element)"
            class="group h-22px min-w-max w-full cursor-pointer rounded-1 flex items-center leading-5 hover:bg-primary-300 dark:hover:bg-gray-600"
            :class="
              selectedNodeId === node.id
                ? 'active bg-primary-600! text-white hover:bg-primary-600!'
                : 'text-black dark:text-#dfe0e2'
            "
            :style="{ paddingLeft: `${node.depth * 15 + 4}px` }"
            role="treeitem"
            :tabindex="
              selectedNodeId === node.id || (!selectedNodeId && treeRows[0]?.id === node.id)
                ? 0
                : -1
            "
            :aria-level="node.depth + 1"
            :aria-expanded="node.hasChildren ? !node.isCollapsed : undefined"
            :aria-selected="selectedNodeId === node.id"
            @click="selectTreeNode(node.id)"
            @dblclick="toggleNodeCollapsed(node)"
            @mouseenter="emit('hover', node.id)"
            @mouseleave="emit('leave')"
          >
            <button
              v-if="node.hasChildren"
              class="h-5 w-5 shrink-0 rounded border-0 bg-transparent op50 flex items-center justify-center transition-transform group-hover:op20 [.active_&]:op20"
              type="button"
              :title="node.isCollapsed ? 'Expand' : 'Collapse'"
              :aria-label="node.isCollapsed ? 'Expand' : 'Collapse'"
              @keydown.stop
              @click.stop="toggleNodeCollapsed(node)"
            >
              <span
                :class="node.isCollapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'"
                aria-hidden="true"
              />
            </button>
            <span v-else class="h-5 w-5 shrink-0" />

            <span v-if="componentLabels" class="font-state-field text-3.5">
              <span
                class="text-gray-400 dark:text-gray-600 group-hover:text-white group-hover:op50"
                :class="selectedNodeId === node.id ? 'text-white! op50!' : ''"
                >&lt;</span
              >
              <span
                class="whitespace-nowrap group-hover:text-white"
                :class="selectedNodeId === node.id ? 'text-white' : ''"
              >
                {{ node.label }}
              </span>
              <span
                v-if="node.renderKey !== undefined && node.renderKey !== ''"
                class="ml-1 text-xs op55"
                :class="selectedNodeId === node.id ? 'text-purple-200 op100' : 'text-purple-500'"
              >
                key={{ node.renderKey }}
              </span>
              <span
                class="text-gray-400 dark:text-gray-600 group-hover:text-white group-hover:op50"
                :class="selectedNodeId === node.id ? 'text-white! op50!' : ''"
                >&gt;</span
              >
              <span
                v-if="node.duration"
                v-tooltip.bottom="
                  'Last mount/patch duration for this component only, excluding children'
                "
                class="ml-1 text-10px op50 font-state-field"
                :class="selectedNodeId === node.id ? 'text-white op70' : ''"
              >
                {{ node.duration }}
              </span>
            </span>
            <span v-else class="font-state-field whitespace-nowrap text-3.5">
              {{ node.label }}
            </span>
            <span
              v-if="componentLabels && node.isFragment"
              v-tooltip.bottom="'Has multiple root DOM nodes'"
              class="component-tag font-state-field ml-2 rounded-sm bg-blue-400 px-1 text-10px leading-4 text-white dark:bg-blue-800"
            >
              fragment
            </span>
            <span
              v-if="componentLabels && node.inactive"
              v-tooltip.bottom="'Currently inactive but not destroyed'"
              class="component-tag font-state-field ml-2 rounded-sm bg-gray-500 px-1 text-10px leading-4 text-white"
            >
              inactive
            </span>
            <span
              v-for="(tag, index) in node.tags"
              :key="`${node.id}-tag-${index}`"
              v-tooltip.bottom="decodeTooltipEntities(tag.tooltip || tag.label)"
              class="component-tag font-state-field ml-2 rounded-sm px-1 text-10px leading-4"
              :style="getTagStyle(tag)"
            >
              {{ tag.label }}
            </span>
            <button
              v-if="componentLabels"
              v-tooltip.bottom="node.favorite ? 'Remove from favorites' : 'Add to favorites'"
              class="ml-1 h-6 w-6 shrink-0 rounded border-0 bg-transparent flex items-center justify-center"
              :class="
                node.favorite ? 'color-amber-400' : 'op0 group-hover:op70 focus-visible:op100'
              "
              type="button"
              :aria-label="node.favorite ? 'Remove from favorites' : 'Add to favorites'"
              :aria-pressed="node.favorite"
              @keydown.stop
              @click.stop="emit('toggleFavorite', node.id)"
            >
              <span
                class="text-5"
                :class="node.favorite ? 'i-carbon-star-filled' : 'i-carbon-star'"
                aria-hidden="true"
              />
            </button>
          </div>
        </template>
      </RecycleScroller>

      <div v-else class="color-muted p-6 text-center">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.inspector-tree-search::-webkit-search-cancel-button {
  appearance: none;
}
</style>

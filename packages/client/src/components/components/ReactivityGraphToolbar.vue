<script setup lang="ts">
import type { ReactivityGraphNodeType, ReactivityGraphSnapshot } from '@vue/devtools-kit'
import { computed, ref, watch, onUnmounted, toRef } from 'vue'
import DevtoolsIcon from '../common/DevtoolsIcon.vue'
import { displayNodeLabel } from '../../utils/reactivity-graph-layout'
import {
  TYPE_LEGEND_TYPES,
  typeColor,
  nodeTypeLabel,
  normalizeSearch,
  matchesGraphSearch,
} from '../../utils/reactivity-graph-display'
import {
  getReachablePathNodeIds,
  getRootPathNodeIds,
  indexGraphRelationships,
} from '../../utils/reactivity-graph-paths'
const props = defineProps<{
  graph: ReactivityGraphSnapshot
  filteredGraph: ReactivityGraphSnapshot
}>()
const filteredGraph = toRef(props, 'filteredGraph')
const graphSearch = defineModel<string>('search', { required: true })
const activeTypeFilters = defineModel<Set<ReactivityGraphNodeType>>('activeTypes', {
  required: true,
})
const pathSelectorOpen = defineModel<boolean>('pathSelectorOpen', { required: true })
const pathStartId = defineModel<string>('pathStartId', { required: true })
const pathEndId = defineModel<string>('pathEndId', { required: true })
const selectedNodeId = defineModel<string>('selectedNodeId')
type PathSelectorSide = 'start' | 'end'

const TYPE_FILTER_DROPDOWN_CLOSE_DELAY = 220

const pathSelectorFocus = ref<PathSelectorSide>()

const pathStartSearch = ref('')

const pathEndSearch = ref('')

const typeFilterDropdownOpen = ref(false)

let typeFilterDropdownCloseTimer: ReturnType<typeof setTimeout> | undefined

const typeFilterCounts = computed(() => {
  const counts = new Map<ReactivityGraphNodeType, number>()
  for (const type of TYPE_LEGEND_TYPES) counts.set(type, 0)
  for (const node of props.graph.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
  }
  return counts
})

const snapshotNodeById = computed(() => new Map(props.graph.nodes.map((node) => [node.id, node])))

const pathSelectorNodes = computed(() =>
  [...filteredGraph.value.nodes].sort((a, b) =>
    endpointLabel(a.id).localeCompare(endpointLabel(b.id)),
  ),
)

const pathStartCandidateNodeIds = computed(() =>
  getRootPathNodeIds(filteredGraph.value.nodes, filteredGraph.value.relationships),
)

const relationshipsBySource = computed(() =>
  indexGraphRelationships(filteredGraph.value.relationships),
)

const pathStartOptions = computed(() =>
  filterPathSelectorNodes(pathStartSearch.value, pathEndId.value, pathStartCandidateNodeIds.value),
)

const pathEndReachableNodeIds = computed(() =>
  pathStartId.value
    ? getReachablePathNodeIds(pathStartId.value, relationshipsBySource.value)
    : new Set<string>(),
)

const pathEndOptions = computed(() =>
  filterPathSelectorNodes(pathEndSearch.value, pathStartId.value, pathEndReachableNodeIds.value),
)

const pathModeActive = computed(() => !!pathStartId.value && !!pathEndId.value)

function inputValue(event: Event) {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function isTypeFilterActive(type: ReactivityGraphNodeType) {
  return activeTypeFilters.value.has(type)
}

function toggleTypeFilter(type: ReactivityGraphNodeType) {
  const next = new Set(activeTypeFilters.value)
  if (next.has(type)) {
    next.delete(type)
  } else {
    next.add(type)
  }
  activeTypeFilters.value = next
  resetPathSelector()
}

function selectAllTypeFilters() {
  activeTypeFilters.value = new Set(TYPE_LEGEND_TYPES)
  resetPathSelector()
}

function clearTypeFilters() {
  activeTypeFilters.value = new Set()
  resetPathSelector()
}

function clearTypeFilterDropdownCloseTimer() {
  if (!typeFilterDropdownCloseTimer) return
  clearTimeout(typeFilterDropdownCloseTimer)
  typeFilterDropdownCloseTimer = undefined
}

function openTypeFilterDropdown() {
  clearTypeFilterDropdownCloseTimer()
  typeFilterDropdownOpen.value = true
}

function scheduleTypeFilterDropdownClose(event?: FocusEvent | MouseEvent) {
  if (event instanceof FocusEvent) {
    const currentTarget = event.currentTarget
    const nextTarget = event.relatedTarget
    if (
      currentTarget instanceof Node &&
      nextTarget instanceof Node &&
      currentTarget.contains(nextTarget)
    ) {
      return
    }
  }

  clearTypeFilterDropdownCloseTimer()
  typeFilterDropdownCloseTimer = setTimeout(() => {
    typeFilterDropdownOpen.value = false
    typeFilterDropdownCloseTimer = undefined
  }, TYPE_FILTER_DROPDOWN_CLOSE_DELAY)
}

function openPathSelector() {
  graphSearch.value = ''
  pathSelectorOpen.value = true
  pathSelectorFocus.value = 'start'
}

function resetPathSelector() {
  pathSelectorOpen.value = false
  pathSelectorFocus.value = undefined
  pathStartId.value = ''
  pathEndId.value = ''
  pathStartSearch.value = ''
  pathEndSearch.value = ''
}

function updatePathSelectorSearch(side: PathSelectorSide, value: string) {
  if (side === 'start') {
    pathStartSearch.value = value
    if (!value || value !== endpointLabel(pathStartId.value)) {
      clearPathStart()
      pathStartSearch.value = value
    }
  } else {
    pathEndSearch.value = value
    if (!value || value !== endpointLabel(pathEndId.value)) {
      clearPathEnd()
      pathEndSearch.value = value
    }
  }
}

function selectPathEndpoint(side: PathSelectorSide, nodeId: string) {
  if (side === 'start') {
    if (pathStartId.value !== nodeId) clearPathEnd()
    pathStartId.value = nodeId
    pathStartSearch.value = endpointLabel(nodeId)
    pathSelectorFocus.value = pathEndId.value ? undefined : 'end'
  } else {
    pathEndId.value = nodeId
    pathEndSearch.value = endpointLabel(nodeId)
    pathSelectorFocus.value = pathStartId.value ? undefined : 'start'
  }

  if (pathStartId.value && pathEndId.value) {
    selectedNodeId.value = undefined
  }
}

function clearPathStart() {
  pathStartId.value = ''
  pathStartSearch.value = ''
  clearPathEnd()
  pathSelectorFocus.value = 'start'
}

function clearPathEnd() {
  pathEndId.value = ''
  pathEndSearch.value = ''
  pathSelectorFocus.value = 'end'
}

function filterPathSelectorNodes(query: string, excludedId: string, allowedIds?: Set<string>) {
  const normalizedQuery = normalizeSearch(query)
  return pathSelectorNodes.value
    .filter((node) => {
      if (node.id === excludedId) return false
      if (allowedIds && !allowedIds.has(node.id)) return false
      return matchesGraphSearch(node, normalizedQuery)
    })
    .slice(0, 8)
}

function endpointLabel(nodeId: string) {
  const node = snapshotNodeById.value.get(nodeId)
  if (!node) return ''
  return `${displayNodeLabel(node)} (${nodeTypeLabel(node.type)})`
}

function endpointDisplayLabel(nodeId: string) {
  const node = snapshotNodeById.value.get(nodeId)
  return node ? displayNodeLabel(node) : ''
}

function endpointTypeColor(nodeId: string) {
  const node = snapshotNodeById.value.get(nodeId)
  return node ? typeColor(node.type) : typeColor('unknown')
}
watch(pathSelectorOpen, (open) => {
  if (!open) resetPathSelector()
})
onUnmounted(clearTypeFilterDropdownCloseTimer)
</script>

<template>
  <div class="shrink-0 bg-base px-2">
    <div class="min-w-0 flex items-center gap-2 py-2">
      <label
        v-if="!pathSelectorOpen"
        class="group relative min-w-0 flex flex-1 items-center justify-between gap-2 overflow-hidden rounded-1 border border-primary-100 px-3 py-0.75 color-base dark:border-gray-700"
      >
        <DevtoolsIcon icon="i-carbon-search" class="shrink-0 color-muted text-4" />
        <input
          v-model="graphSearch"
          class="min-w-0 w-full border-0 bg-transparent p-0 outline-none text-3.5 color-inherit placeholder-color-gray-500 dark:placeholder-gray-300"
          placeholder="Search graph..."
          type="search"
        />
        <button
          v-if="graphSearch"
          v-tooltip.top="'Clear search'"
          class="h-6 w-6 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Clear search"
          @click="graphSearch = ''"
        >
          <DevtoolsIcon icon="i-carbon-close" class="text-3.5" />
        </button>
      </label>

      <div v-else class="min-w-0 flex flex-1 items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <div
            v-if="pathStartId"
            class="min-w-0 w-full overflow-hidden rounded-1 border border-base px-2 py-1 color-base flex items-center gap-1.5"
          >
            <span
              class="h-2.3 w-2.3 shrink-0 rounded-full"
              :style="{ background: endpointTypeColor(pathStartId) }"
            />
            <span class="min-w-0 flex-1 truncate font-state-field text-3.5">
              {{ endpointDisplayLabel(pathStartId) }}
            </span>
            <button
              v-tooltip.top="'Clear start'"
              class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center op70 hover:bg-active hover:color-base hover:op100"
              type="button"
              aria-label="Clear path start"
              @click="clearPathStart"
            >
              <DevtoolsIcon icon="i-carbon-clean" class="text-5.5" />
            </button>
          </div>
          <input
            v-else
            class="min-w-0 w-full rounded-1 border border-base bg-transparent px-3 py-1 outline-none font-state-field text-3.5 color-base placeholder-color-gray-500 dark:placeholder-gray-300"
            placeholder="Start"
            type="search"
            :value="pathStartSearch"
            @focus="pathSelectorFocus = 'start'"
            @input="updatePathSelectorSearch('start', inputValue($event))"
            @keydown.esc="resetPathSelector"
          />
          <div
            v-if="!pathStartId && pathSelectorFocus === 'start'"
            class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-58 overflow-auto rounded-1 border border-base bg-base p-1 shadow"
          >
            <button
              v-for="node in pathStartOptions"
              :key="node.id"
              class="min-w-0 w-full rounded-1 border-0 bg-transparent px-2 py-1.5 text-left color-base flex items-center gap-1.5 hover:bg-active"
              type="button"
              @mousedown.prevent="selectPathEndpoint('start', node.id)"
            >
              <span
                class="h-2.3 w-2.3 shrink-0 rounded-full"
                :style="{ background: typeColor(node.type) }"
              />
              <span class="min-w-0 flex-1 truncate font-state-field text-3.5">
                {{ displayNodeLabel(node) }}
              </span>
              <span class="shrink-0 color-muted text-3">
                {{ nodeTypeLabel(node.type) }}
              </span>
            </button>
            <div v-if="!pathStartOptions.length" class="px-2 py-2 color-muted text-3 italic">
              No matching nodes
            </div>
          </div>
        </div>

        <DevtoolsIcon icon="i-carbon-arrow-right" class="shrink-0 color-muted text-5" />

        <div class="relative min-w-0 flex-1">
          <div
            v-if="pathEndId"
            class="min-w-0 w-full overflow-hidden rounded-1 border border-base px-2 py-1 color-base flex items-center gap-1.5"
          >
            <span
              class="h-2.3 w-2.3 shrink-0 rounded-full"
              :style="{ background: endpointTypeColor(pathEndId) }"
            />
            <span class="min-w-0 flex-1 truncate font-state-field text-3.5">
              {{ endpointDisplayLabel(pathEndId) }}
            </span>
            <button
              v-tooltip.top="'Clear end'"
              class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center op70 hover:bg-active hover:color-base hover:op100"
              type="button"
              aria-label="Clear path end"
              @click="clearPathEnd"
            >
              <DevtoolsIcon icon="i-carbon-clean" class="text-5.5" />
            </button>
          </div>
          <input
            v-else
            class="min-w-0 w-full rounded-1 border border-base bg-transparent px-3 py-1 outline-none font-state-field text-3.5 color-base placeholder-color-gray-500 dark:placeholder-gray-300"
            placeholder="End"
            type="search"
            :value="pathEndSearch"
            @focus="pathSelectorFocus = 'end'"
            @input="updatePathSelectorSearch('end', inputValue($event))"
            @keydown.esc="resetPathSelector"
          />
          <div
            v-if="!pathEndId && pathSelectorFocus === 'end'"
            class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-58 overflow-auto rounded-1 border border-base bg-base p-1 shadow"
          >
            <button
              v-for="node in pathEndOptions"
              :key="node.id"
              class="min-w-0 w-full rounded-1 border-0 bg-transparent px-2 py-1.5 text-left color-base flex items-center gap-1.5 hover:bg-active"
              type="button"
              @mousedown.prevent="selectPathEndpoint('end', node.id)"
            >
              <span
                class="h-2.3 w-2.3 shrink-0 rounded-full"
                :style="{ background: typeColor(node.type) }"
              />
              <span class="min-w-0 flex-1 truncate font-state-field text-3.5">
                {{ displayNodeLabel(node) }}
              </span>
              <span class="shrink-0 color-muted text-3">
                {{ nodeTypeLabel(node.type) }}
              </span>
            </button>
            <div v-if="!pathEndOptions.length" class="px-2 py-2 color-muted text-3 italic">
              {{ pathStartId ? 'No matching nodes' : 'Select a start node to get end nodes' }}
            </div>
          </div>
        </div>
      </div>

      <button
        v-if="!pathSelectorOpen"
        v-tooltip.top="pathSelectorOpen ? 'Clear path selector' : 'Graph path selector'"
        class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
        :class="pathSelectorOpen || pathModeActive ? 'bg-active color-active' : ''"
        type="button"
        aria-label="Graph path selector"
        :aria-pressed="pathSelectorOpen || pathModeActive"
        @click="pathSelectorOpen ? resetPathSelector() : openPathSelector()"
      >
        <DevtoolsIcon icon="i-ri-route-line" class="text-5.5" />
      </button>
      <button
        v-else
        v-tooltip.top="'Close path selector'"
        class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
        type="button"
        aria-label="Close path selector"
        @click="resetPathSelector"
      >
        <DevtoolsIcon icon="i-carbon-close" class="text-5" />
      </button>

      <div
        class="relative shrink-0"
        @focusin="openTypeFilterDropdown"
        @focusout="scheduleTypeFilterDropdownClose"
        @mouseenter="openTypeFilterDropdown"
        @mouseleave="scheduleTypeFilterDropdownClose"
      >
        <button
          v-tooltip.top="'Filter reactivity types'"
          class="h-7 w-7 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          :class="typeFilterDropdownOpen ? 'bg-active color-base' : ''"
          type="button"
          aria-label="Filter reactivity types"
          aria-haspopup="menu"
          :aria-expanded="typeFilterDropdownOpen"
        >
          <DevtoolsIcon icon="i-carbon-filter" class="text-4" />
        </button>

        <div
          class="absolute right-0 top-[calc(100%+4px)] z-50 w-62 rounded-1 border border-base bg-base p-2 shadow transition-opacity"
          :class="
            typeFilterDropdownOpen ? 'pointer-events-auto op-100' : 'pointer-events-none op-0'
          "
          role="menu"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="color-muted text-3">Filter type</span>
            <span class="w-14 shrink-0 text-right color-muted font-state-field text-3">
              {{ filteredGraph.nodes.length }} / {{ props.graph.nodes.length }}
            </span>
          </div>

          <label
            v-for="type in TYPE_LEGEND_TYPES"
            :key="type"
            class="h-7 rounded-1 px-2 color-base flex items-center gap-1.5 select-none hover:bg-active"
            :class="isTypeFilterActive(type) ? '' : 'op45 grayscale'"
            :title="nodeTypeLabel(type)"
          >
            <input
              class="h-3.5 w-3.5 accent-emerald-600"
              type="checkbox"
              :checked="isTypeFilterActive(type)"
              @change="toggleTypeFilter(type)"
            />
            <span
              class="h-2.3 w-2.3 shrink-0 rounded-full"
              :style="{ background: typeColor(type) }"
            />
            <span class="min-w-0 flex-1 truncate font-state-field text-3.5">
              {{ nodeTypeLabel(type) }}
            </span>
            <span class="w-10 shrink-0 text-right color-muted text-3">
              {{ typeFilterCounts.get(type) ?? 0 }}
            </span>
          </label>

          <div class="mt-1 flex items-center gap-1 border-t border-base pt-1">
            <button
              class="h-7 flex-1 rounded-1 border border-base bg-transparent px-2 color-muted text-3 hover:bg-active hover:color-base"
              type="button"
              @click="selectAllTypeFilters"
            >
              Select all
            </button>
            <button
              class="h-7 flex-1 rounded-1 border border-base bg-transparent px-2 color-muted text-3 hover:bg-active hover:color-base"
              type="button"
              @click="clearTypeFilters"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

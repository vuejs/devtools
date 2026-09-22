<script setup lang="ts">
import type { ComponentStateSnapshotMessage, EncodedValue, StateEntry } from '@vue/devtools-kit'
import StateEntryRow from '../components/StateEntryRow.vue'
import DevtoolsIcon from './DevtoolsIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useDevtoolsClient } from '../../composables/devtools-client'

interface InspectorStateNode {
  id: string
  label: string
}

interface InspectorStateAction {
  icon: string
  tooltip?: string
  ariaLabel?: string
}

const props = withDefaults(
  defineProps<{
    selectedNode?: InspectorStateNode
    selectedNodeId?: string
    state?: ComponentStateSnapshotMessage
    filter: string
    loading?: boolean
    noSelectionText?: string
    selectPrompt?: string
    filterPlaceholder?: string
    loadingText?: string
    emptyText?: string
    noMatchingText?: string
    nodeActions?: InspectorStateAction[]
    selectedLabelMode?: 'plain' | 'component'
    showMoreText?: string
  }>(),
  {
    selectedNode: undefined,
    selectedNodeId: undefined,
    state: undefined,
    loading: false,
    noSelectionText: 'No node selected',
    selectPrompt: undefined,
    filterPlaceholder: 'Filter state...',
    loadingText: 'Loading state',
    emptyText: 'No state entries',
    noMatchingText: 'No matching state entries',
    nodeActions: () => [],
    selectedLabelMode: 'plain',
    showMoreText: undefined,
  },
)

const emit = defineEmits<{
  'update:filter': [value: string]
  'node-action': [index: number]
  'show-more': [sectionId: string]
}>()

const { formatValue, getEntryKey, getEntryValue } = useDevtoolsClient()

const stateContainer = ref<HTMLElement>()
const collapsedStateSectionIds = ref<Set<string>>(new Set())

const filteredStateSections = computed(() => {
  const sections = props.state?.sections ?? []
  const filter = props.filter.trim().toLowerCase()
  if (!filter) return sections

  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => matchesStateEntryFilter(entry, filter)),
    }))
    .filter((section) => section.entries.length > 0)
})

const emptyState = computed(() => !filteredStateSections.value.length)
const emptyText = computed(() =>
  props.state?.sections.length ? props.noMatchingText : props.emptyText,
)

watch(
  () => props.selectedNodeId,
  async () => {
    collapsedStateSectionIds.value = new Set()
    await nextTick()
    stateContainer.value?.scrollTo({ top: 0 })
  },
)

function updateFilter(event: Event) {
  emit('update:filter', event.target instanceof HTMLInputElement ? event.target.value : '')
}

function isStateSectionExpanded(sectionId: string): boolean {
  return !collapsedStateSectionIds.value.has(sectionId)
}

function toggleStateSection(sectionId: string) {
  const collapsed = new Set(collapsedStateSectionIds.value)
  if (collapsed.has(sectionId)) collapsed.delete(sectionId)
  else collapsed.add(sectionId)
  collapsedStateSectionIds.value = collapsed
}

function matchesStateEntryFilter(entry: StateEntry, filter: string): boolean {
  return (
    entry.key.toLowerCase().includes(filter) || matchesEncodedValue(getEntryValue(entry), filter)
  )
}

function matchesEncodedValue(
  value: EncodedValue,
  filter: string,
  seenHandles = new Set<string>(),
): boolean {
  if (formatValue(value).toLowerCase().includes(filter)) return true

  const handle = 'handle' in value ? value.handle : undefined
  if (handle) {
    const seenKey = `${value.kind}:${handle}`
    if (seenHandles.has(seenKey)) return false
    seenHandles.add(seenKey)
  }

  switch (value.kind) {
    case 'custom':
      return (
        includesFilter(value.type, filter) ||
        includesFilter(value.display, filter) ||
        includesFilter(value.tooltip, filter) ||
        includesFilter(value.file, filter) ||
        matchesEncodedValue(value.value, filter, seenHandles) ||
        matchesUnknownRecord(value.fields, filter)
      )
    case 'array':
    case 'object':
    case 'map':
    case 'set':
      return value.preview.some(
        (entry) =>
          entry.key.toLowerCase().includes(filter) ||
          matchesEncodedValue(entry.value, filter, seenHandles),
      )
    case 'component':
      return includesFilter(value.name, filter) || includesFilter(value.id, filter)
    case 'dom':
      return (
        includesFilter(value.tag, filter) ||
        includesFilter(value.id, filter) ||
        includesFilter(value.className, filter)
      )
    case 'error':
      return (
        includesFilter(value.name, filter) ||
        includesFilter(value.message, filter) ||
        includesFilter(value.stack, filter)
      )
    case 'function':
      return includesFilter(value.name, filter) || includesFilter(value.sourcePreview, filter)
    case 'symbol':
      return includesFilter(value.description, filter)
    default:
      return false
  }
}

function matchesUnknownRecord(value: Record<string, unknown> | undefined, filter: string): boolean {
  if (!value) return false
  return Object.entries(value).some(
    ([key, item]) => key.toLowerCase().includes(filter) || includesFilter(String(item), filter),
  )
}

function includesFilter(value: string | undefined, filter: string): boolean {
  return !!value && value.toLowerCase().includes(filter)
}
</script>

<template>
  <div class="relative h-full min-h-0 flex flex-col p-2">
    <div class="shrink-0 flex items-center gap-2 py-2">
      <span
        v-if="selectedNode && selectedLabelMode === 'plain'"
        class="font-state-field min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 text-3.5"
      >
        {{ selectedNode.label }}
      </span>
      <span
        v-else-if="selectedNode"
        class="font-state-field min-w-0 shrink-0 flex items-center px-1 text-3.5"
      >
        <span class="text-gray-400 dark:text-gray-600">&lt;</span>
        <span class="max-w-40 overflow-hidden text-ellipsis whitespace-nowrap">
          {{ selectedNode.label }}
        </span>
        <span class="text-gray-400 dark:text-gray-600">&gt;</span>
      </span>
      <span v-else class="shrink-0 color-muted text-13px">
        {{ noSelectionText }}
      </span>

      <label
        class="group relative min-w-0 flex flex-1 items-center justify-between gap-0.5 overflow-hidden rounded-1 border border-primary-100 px-3 py-0.75 color-base dark:border-gray-700"
      >
        <input
          class="min-w-0 w-full border-0 bg-transparent p-0 outline-none text-3.5 color-inherit placeholder-color-gray-500 dark:placeholder-gray-300"
          :placeholder="filterPlaceholder"
          :value="filter"
          type="search"
          @input="updateFilter"
        />
      </label>

      <button
        v-for="(action, index) in nodeActions"
        :key="`inspector-node-action-${index}`"
        v-tooltip.bottom="action.tooltip || 'Run node action'"
        class="h-7 w-7 shrink-0 rounded-1 border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
        type="button"
        :aria-label="action.ariaLabel || action.tooltip || 'Run inspector node action'"
        @click="emit('node-action', index)"
      >
        <DevtoolsIcon :icon="action.icon" class="text-4" />
      </button>
    </div>

    <div v-if="selectedNodeId" ref="stateContainer" class="min-h-0 flex-1 overflow-auto px-1 pb-3">
      <div v-if="loading && !state" class="py-8 text-center color-muted">
        {{ loadingText }}
      </div>

      <div v-else-if="!emptyState">
        <section v-for="section in filteredStateSections" :key="section.id">
          <div
            class="flex cursor-pointer items-center hover:bg-active"
            @click="toggleStateSection(section.id)"
          >
            <span
              class="i-carbon-chevron-right flex-none text-4 op50 transition-transform"
              :class="isStateSectionExpanded(section.id) ? 'rotate-90' : ''"
              aria-hidden="true"
            />
            <span class="font-state-field text-3.5 text-#a3a3a3">
              {{ section.label }}
            </span>
            <span v-if="section.partial" class="ml-2 color-muted text-11px">partial</span>
          </div>

          <div v-if="isStateSectionExpanded(section.id)">
            <StateEntryRow
              v-for="entry in section.entries"
              :key="getEntryKey(entry)"
              :entry="entry"
              :depth="0"
            />
            <button
              v-if="section.partial && showMoreText"
              class="ml-8 h-6 rounded-1 border-0 bg-transparent px-2 color-muted inline-flex items-center gap-1 text-12px hover:bg-active hover:color-base"
              type="button"
              @click="emit('show-more', section.id)"
            >
              <span class="i-carbon-overflow-menu-horizontal text-4" aria-hidden="true" />
              {{ showMoreText }}
            </button>
          </div>
        </section>
      </div>

      <div v-else class="py-8 text-center color-muted">
        {{ emptyText }}
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 flex items-center justify-center color-muted">
      {{ selectPrompt ?? noSelectionText }}
    </div>

    <slot />
  </div>
</template>

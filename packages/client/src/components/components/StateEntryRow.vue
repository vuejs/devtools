<script setup lang="ts">
import type { EncodedValue, StateEntry, ValueEntry } from '@vue/devtools-kit'
import { formatEditText, parseEditText } from '@vue/devtools-kit'
import StateEntryActions from './StateEntryActions.vue'
import {
  getDisplayValue,
  getCustomEncodedValue,
  isStateEntryInputEditable,
} from '../../utils/state-entry'
import { computed, ref, watch } from 'vue'
import { useDevtoolsClient } from '../../composables/devtools-client'

defineOptions({ name: 'StateEntryRow' })

const props = defineProps<{
  entry: StateEntry
  depth: number
}>()

const STATE_FIELDS_LIMIT_SIZE = 30

const { editComponentState, expandEntryValue, formatValue, getEntryKey, getEntryValue } =
  useDevtoolsClient()

const collapsed = ref(true)
const visibleLimit = ref(STATE_FIELDS_LIMIT_SIZE)
const editingStateEntryKey = ref<string>()
const editingStateText = ref('')
const stateEditError = ref<string>()
const storedGlobalName = ref<string>()

const entryValue = computed(() => getEntryValue(props.entry))
const childEntries = computed(() =>
  getValuePreview(entryValue.value)
    .slice(0, visibleLimit.value)
    .map((preview) => createChildEntry(props.entry, preview)),
)
const totalChildren = computed(() => getValueItemCount(entryValue.value))
const hasExpandableEntry = computed(() => hasExpandableValue(entryValue.value))
const hasMoreChildren = computed(() => totalChildren.value > childEntries.value.length)

watch(
  () => props.entry.value,
  () => {
    if (!collapsed.value) {
      void ensureExpandedValue().catch((err) => {
        stateEditError.value = err instanceof Error ? err.message : String(err)
      })
    }
  },
)

async function toggleStateEntry() {
  if (!hasExpandableEntry.value) return

  collapsed.value = !collapsed.value
  if (!collapsed.value) await ensureExpandedValue()
}

async function ensureExpandedValue() {
  if (getValuePreview(entryValue.value).length === 0 && hasExpandableValue(entryValue.value))
    await expandEntryValue(props.entry, visibleLimit.value)
}

async function showMoreChildren() {
  visibleLimit.value += STATE_FIELDS_LIMIT_SIZE
  const expected = Math.min(visibleLimit.value, totalChildren.value)
  if (getValuePreview(entryValue.value).length < expected)
    await expandEntryValue(props.entry, visibleLimit.value)
}

function createChildEntry(parent: StateEntry, preview: ValueEntry): StateEntry {
  const meta = { ...parent.meta }
  delete meta.stateTypeName
  delete meta.raw
  return {
    key: preview.key,
    path: [...parent.path, preview.key],
    value: preview.value,
    editable: parent.editable,
    meta,
  }
}

function getValuePreview(value: EncodedValue): ValueEntry[] {
  value = getDisplayValue(value)
  return 'preview' in value ? value.preview : []
}

function hasExpandableValue(value: EncodedValue): boolean {
  value = getDisplayValue(value)
  return value.kind === 'circular' || getValueItemCount(value) > 0
}

function getValueItemCount(value: EncodedValue): number {
  value = getDisplayValue(value)
  switch (value.kind) {
    case 'array':
      return value.length
    case 'object':
      return value.entries
    case 'map':
    case 'set':
      return value.size
    default:
      return getValuePreview(value).length
  }
}

function formatStateEntryValue(entry: StateEntry): string {
  const value = getEntryValue(entry)
  const custom = getCustomEncodedValue(value)
  if (custom) return custom.display ?? formatValue(custom.value)
  return formatValue(value)
}

function getEntryStateTypeName(entry: StateEntry): string | undefined {
  const stateTypeName = entry.meta?.stateTypeName
  return typeof stateTypeName === 'string' ? stateTypeName : undefined
}

function shouldShowEntryStateTypeName(entry: StateEntry): boolean {
  const stateTypeName = getEntryStateTypeName(entry)
  return !!stateTypeName
}

function getEntryStateTooltip(entry: StateEntry): string | undefined {
  const value = getEntryValue(entry)
  const custom = getCustomEncodedValue(value)
  if (custom?.tooltip) return custom.tooltip

  const raw = entry.meta?.raw
  return typeof raw === 'string' ? raw : undefined
}

function isEditingStateEntry(entry: StateEntry): boolean {
  return editingStateEntryKey.value === getEntryKey(entry)
}

function startStateEntryEdit(entry: StateEntry) {
  if (!isStateEntryInputEditable(entry, getEntryValue(entry))) return

  editingStateEntryKey.value = getEntryKey(entry)
  editingStateText.value = formatEditText(getDisplayValue(getEntryValue(entry)))
  stateEditError.value = undefined
}

function cancelStateEntryEdit() {
  editingStateEntryKey.value = undefined
  editingStateText.value = ''
  stateEditError.value = undefined
}

async function submitStateEntryEdit(entry: StateEntry) {
  try {
    const value = parseEditText(getDisplayValue(getEntryValue(entry)), editingStateText.value)
    await editComponentState(entry, value)
    cancelStateEntryEdit()
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

function isStateEntryEditValid(entry: StateEntry): boolean {
  return !getStateEntryEditWarning(entry)
}

function getStateEntryEditWarning(entry: StateEntry): string | undefined {
  try {
    parseEditText(getDisplayValue(getEntryValue(entry)), editingStateText.value)
    return
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function getStateEntryEditInputWidth(entry: StateEntry): string {
  return getDisplayValue(getEntryValue(entry)).kind === 'date' ? 'w-60' : 'w-30'
}

function getStateValueClass(value: EncodedValue): string {
  const custom = getCustomEncodedValue(value)
  if (custom) return `custom-state-type ${custom.type ? `custom-${custom.type}` : ''}`
  value = getDisplayValue(value)

  switch (value.kind) {
    case 'string':
      return 'string-state-type'
    case 'boolean':
      return 'boolean-state-type'
    case 'null':
    case 'undefined':
      return 'null-state-type'
    case 'number':
    case 'bigint':
    case 'date':
    case 'regexp':
    case 'symbol':
      return 'literal-state-type'
    default:
      return 'state-value'
  }
}
</script>

<template>
  <div>
    <div
      class="group/state-row font-state-field min-w-0 flex items-center text-3.5 hover:bg-active"
      :class="[
        hasExpandableEntry ? 'cursor-pointer' : 'cursor-default',
        isEditingStateEntry(entry) ? 'bg-active' : '',
      ]"
      :style="{ paddingLeft: `${19 + depth * 15}px` }"
      @click="toggleStateEntry"
    >
      <span
        v-if="hasExpandableEntry"
        class="i-carbon-chevron-right flex-none text-4 op50 transition-transform"
        :class="collapsed ? '' : 'rotate-90'"
        aria-hidden="true"
      />
      <span v-else class="w-4 flex-none" />
      <span
        class="state-key max-w-[40%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap op70"
      >
        {{ entry.key }}
      </span>
      <span class="colon mx-1 shrink-0">:</span>
      <template v-if="isEditingStateEntry(entry)">
        <span class="mr-1 flex-inline items-center gap-1">
          <input
            v-model="editingStateText"
            class="font-state-field h-25px rounded-1 border border-#8883 bg-white/90 px-1 text-3.5 color-base outline-none focus:border-primary-500/60 dark:bg-#181818"
            :class="[
              getStateEntryEditInputWidth(entry),
              !isStateEntryEditValid(entry) || stateEditError ? 'border-red-500/70!' : '',
            ]"
            type="text"
            autofocus
            @input="stateEditError = undefined"
            @click.stop
            @keydown.enter.prevent="isStateEntryEditValid(entry) && submitStateEntryEdit(entry)"
            @keydown.esc.prevent="cancelStateEntryEdit"
          />
          <button
            class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
            type="button"
            title="Esc to cancel"
            aria-label="Cancel state value edit"
            @click.stop="cancelStateEntryEdit"
          >
            <span class="i-carbon-close text-3.5" aria-hidden="true" />
          </button>
          <button
            v-if="isStateEntryEditValid(entry) && !stateEditError"
            class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-active flex items-center justify-center hover:bg-active"
            type="button"
            title="Enter to submit change"
            aria-label="Save state value"
            @click.stop="submitStateEntryEdit(entry)"
          >
            <span class="i-carbon-save text-3.5" aria-hidden="true" />
          </button>
          <span
            v-else
            class="i-carbon-warning shrink-0 text-3.5 text-amber-500 dark:text-amber-300"
            :title="stateEditError || getStateEntryEditWarning(entry)"
            aria-hidden="true"
          />
        </span>
      </template>
      <template v-else>
        <span
          class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          :class="getStateValueClass(getEntryValue(entry))"
          :title="getEntryStateTooltip(entry)"
        >
          {{ formatStateEntryValue(entry) }}
        </span>
        <span
          v-if="shouldShowEntryStateTypeName(entry)"
          class="ml-1 shrink-0 text-neutral-500 text-11px dark:text-neutral-500"
        >
          ({{ getEntryStateTypeName(entry) }})
        </span>
        <span
          v-if="storedGlobalName"
          class="ml-1 shrink-0 rounded-1 bg-active px-1 color-active text-11px"
        >
          = {{ storedGlobalName }}
        </span>
      </template>
      <StateEntryActions
        :entry="entry"
        :depth="depth"
        :editing="isEditingStateEntry(entry)"
        v-model:error="stateEditError"
        v-model:stored-global-name="storedGlobalName"
        @edit="startStateEntryEdit(entry)"
        @expand="collapsed = false"
      />
    </div>

    <div v-if="hasExpandableEntry && !collapsed" class="font-state-field text-3.5">
      <StateEntryRow
        v-for="child in childEntries"
        :key="getEntryKey(child)"
        :entry="child"
        :depth="depth + 1"
      />
      <button
        v-if="hasMoreChildren"
        class="ml-8 h-6 rounded-1 border-0 bg-transparent px-2 color-muted inline-flex items-center gap-1 text-12px hover:bg-active hover:color-base"
        type="button"
        @click.stop="showMoreChildren"
      >
        <span class="i-carbon-overflow-menu-horizontal text-4" aria-hidden="true" />
        Show more
      </button>
    </div>
  </div>
</template>

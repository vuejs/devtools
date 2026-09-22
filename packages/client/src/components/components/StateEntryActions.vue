<script setup lang="ts">
import type { EncodedValue, StateEntry } from '@vue/devtools-kit'
import { computed, ref } from 'vue'
import Checkbox from '../common/Checkbox.vue'
import DevtoolsIcon from '../common/DevtoolsIcon.vue'
import { useDevtoolsClient } from '../../composables/devtools-client'
import {
  getDisplayValue,
  getCustomEncodedValue,
  isReadOnlyCustomValue,
  isStateEntryInputEditable,
} from '../../utils/state-entry'
const props = defineProps<{ entry: StateEntry; depth: number; editing: boolean }>()
const emit = defineEmits<{ edit: []; expand: [] }>()
const stateEditError = defineModel<string>('error')
const storedGlobalName = defineModel<string>('storedGlobalName')
const {
  addComponentStateEntry,
  deleteComponentState,
  editComponentState,
  executeCustomStateAction,
  formatValue,
  getEntryKey,
  getEntryValue,
  openFileInEditor,
  openInEditorAvailable,
  storeStateEntryAsGlobal,
  isComputedStateEntry,
  recomputeStateEntry,
} = useDevtoolsClient()
const entryValue = computed(() => getEntryValue(props.entry))
const copied = ref<'path' | 'value'>()

const childAdditionAvailable = computed(
  () => props.entry.editable && supportsAddingChild(entryValue.value),
)

const addChildDisabled = computed(() => props.entry.meta?.disableAdd === true)

function supportsAddingChild(value: EncodedValue): boolean {
  const custom = getCustomEncodedValue(value)
  if (custom && (custom.readOnly || custom.abstract)) return false
  value = getDisplayValue(value)
  return (
    !addChildDisabled.value &&
    (value.kind === 'array' || value.kind === 'object' || value.kind === 'map')
  )
}

function isStateEntryEditable(entry: StateEntry): boolean {
  if (!entry.editable) return false
  if (isReadOnlyCustomValue(getEntryValue(entry))) return false

  const value = getDisplayValue(getEntryValue(entry))
  switch (value.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'undefined':
    case 'bigint':
    case 'date':
    case 'regexp':
      return true
    default:
      return false
  }
}

function isBooleanStateEntry(entry: StateEntry): boolean {
  return entry.editable && getDisplayValue(getEntryValue(entry)).kind === 'boolean'
}

function getBooleanStateEntryValue(entry: StateEntry): boolean {
  const value = getDisplayValue(getEntryValue(entry))
  return value.kind === 'boolean' ? value.value : false
}

function stateEntryIncrementAvailable(entry: StateEntry): boolean {
  const value = getDisplayValue(getEntryValue(entry))
  return entry.editable && (value.kind === 'number' || value.kind === 'bigint')
}

async function quickEditStateEntry(entry: StateEntry, value: unknown) {
  try {
    stateEditError.value = undefined
    await editComponentState(entry, value)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

async function incrementStateEntry(entry: StateEntry, offset: 1 | -1) {
  const value = getDisplayValue(getEntryValue(entry))
  if (value.kind === 'number') {
    const current = typeof value.value === 'number' ? value.value : Number(value.value)
    await quickEditStateEntry(entry, current + offset)
    return
  }

  if (value.kind === 'bigint')
    await quickEditStateEntry(entry, BigInt(value.value) + BigInt(offset))
}

async function removeStateEntry(entry: StateEntry) {
  try {
    stateEditError.value = undefined
    await deleteComponentState(entry)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

async function addChildStateEntry(entry: StateEntry) {
  try {
    stateEditError.value = undefined
    emit('expand')
    await addComponentStateEntry(entry)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

function stateEntryGlobalStorageAvailable(entry: StateEntry): boolean {
  const value = getEntryValue(entry)
  if ('handle' in getDisplayValue(value) || getCustomEncodedValue(value)?.handle) return true
  return entry.meta?.inspectorId == null
}

async function storeEntryAsGlobal(entry: StateEntry) {
  try {
    stateEditError.value = undefined
    const name = await storeStateEntryAsGlobal(entry)
    if (!name) return

    storedGlobalName.value = name
    window.setTimeout(() => {
      if (storedGlobalName.value === name) storedGlobalName.value = undefined
    }, 3000)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

async function recomputeEntry(entry: StateEntry) {
  try {
    stateEditError.value = undefined
    await recomputeStateEntry(entry)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

async function copyEntryValue(entry: StateEntry) {
  await copyText(encodedValueToText(getEntryValue(entry)), 'value')
}

async function copyEntryPath(entry: StateEntry) {
  await copyText(entry.path.join('.'), 'path')
}

async function copyText(value: string, type: 'path' | 'value') {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(value)
  copied.value = type
  window.setTimeout(() => {
    if (copied.value === type) copied.value = undefined
  }, 1200)
}

function encodedValueToText(value: EncodedValue): string {
  if (value.kind === 'custom') return value.display ?? encodedValueToText(value.value)

  switch (value.kind) {
    case 'null':
    case 'undefined':
      return value.kind
    case 'boolean':
    case 'number':
    case 'bigint':
      return String(value.value)
    case 'string':
      return value.value
    case 'symbol':
      return `Symbol(${value.description})`
    case 'date':
    case 'regexp':
      return value.value
    case 'array': {
      const suffix = value.length > value.preview.length ? ', ...' : ''
      return `[${value.preview.map((item) => encodedValueToText(item.value)).join(', ')}${suffix}]`
    }
    case 'object': {
      const suffix = value.entries > value.preview.length ? ', ...' : ''
      const entries = value.preview.map((item) => `${item.key}: ${encodedValueToText(item.value)}`)
      return `${value.name} { ${entries.join(', ')}${suffix} }`
    }
    case 'map':
    case 'set': {
      const suffix = value.size > value.preview.length ? ', ...' : ''
      const entries = value.preview.map((item) => `${item.key}: ${encodedValueToText(item.value)}`)
      return `${formatValue(value)} { ${entries.join(', ')}${suffix} }`
    }
    case 'component':
    case 'dom':
    case 'function':
    case 'error':
    case 'circular':
      return formatValue(value)
  }
}

function getCustomActions(entry: StateEntry): { icon?: string; tooltip?: string }[] {
  const value = getEntryValue(entry)
  return getCustomEncodedValue(value)?.actions ?? []
}

function getCustomFile(entry: StateEntry): string | undefined {
  const value = getEntryValue(entry)
  return getCustomEncodedValue(value)?.file
}

async function runCustomAction(entry: StateEntry, actionIndex: number) {
  try {
    stateEditError.value = undefined
    await executeCustomStateAction(entry, actionIndex)
  } catch (err) {
    stateEditError.value = err instanceof Error ? err.message : String(err)
  }
}

async function openCustomFile(entry: StateEntry) {
  const file = getCustomFile(entry)
  if (!file) return
  await openFileInEditor(file)
}
</script>
<template>
  <div class="ml-auto shrink-0 flex pl-1" :class="editing ? '' : 'op0 group-hover/state-row:op100'">
    <button
      v-if="getCustomFile(entry) && openInEditorAvailable"
      v-tooltip.bottom="'Open file'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Open custom state file"
      @click.stop="openCustomFile(entry)"
    >
      <span class="i-carbon-launch text-4" aria-hidden="true" />
    </button>
    <button
      v-for="(action, index) in getCustomActions(entry)"
      :key="`${getEntryKey(entry)}-custom-action-${index}`"
      v-tooltip.bottom="action.tooltip || 'Run custom action'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Run custom state action"
      @click.stop="runCustomAction(entry, index)"
    >
      <DevtoolsIcon :icon="action.icon" class="text-4" />
    </button>
    <template v-if="isStateEntryEditable(entry) && !editing">
      <button
        v-if="isStateEntryInputEditable(entry, getEntryValue(entry))"
        v-tooltip.bottom="'Edit value'"
        class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
        type="button"
        aria-label="Edit state value"
        @click.stop="emit('edit')"
      >
        <span class="i-carbon-edit text-4" aria-hidden="true" />
      </button>
      <Checkbox
        v-if="isBooleanStateEntry(entry)"
        v-tooltip.bottom="'Toggle boolean'"
        class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
        aria-label="Toggle boolean state value"
        :model-value="getBooleanStateEntryValue(entry)"
        size="sm"
        @click.stop
        @update:model-value="(value: boolean) => quickEditStateEntry(entry, value)"
      />
      <template v-else-if="stateEntryIncrementAvailable(entry)">
        <button
          v-tooltip.bottom="'Increment'"
          class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Increment state value"
          @click.stop="incrementStateEntry(entry, 1)"
        >
          <span class="i-carbon-add text-4" aria-hidden="true" />
        </button>
        <button
          v-tooltip.bottom="'Decrement'"
          class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Decrement state value"
          @click.stop="incrementStateEntry(entry, -1)"
        >
          <span class="i-carbon-subtract text-4" aria-hidden="true" />
        </button>
      </template>
    </template>
    <button
      v-if="childAdditionAvailable"
      v-tooltip.bottom="'Add child value'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Add child state value"
      @click.stop="addChildStateEntry(entry)"
    >
      <span class="i-carbon-add-alt text-4" aria-hidden="true" />
    </button>
    <button
      v-if="depth > 0 && entry.editable"
      v-tooltip.bottom="'Delete value'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Delete state value"
      @click.stop="removeStateEntry(entry)"
    >
      <span class="i-carbon-trash-can text-4" aria-hidden="true" />
    </button>
    <button
      v-if="isComputedStateEntry(entry)"
      v-tooltip.bottom="'Recompute'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Recompute computed value"
      @click.stop="recomputeEntry(entry)"
    >
      <span class="i-carbon-renew text-4" aria-hidden="true" />
    </button>
    <button
      v-if="stateEntryGlobalStorageAvailable(entry)"
      v-tooltip.bottom="
        storedGlobalName ? `Stored as ${storedGlobalName}` : 'Store as global variable'
      "
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Store state value as global variable"
      @click.stop="storeEntryAsGlobal(entry)"
    >
      <span class="i-carbon-terminal text-4" aria-hidden="true" />
    </button>
    <button
      v-tooltip.bottom="copied === 'value' ? 'Copied value' : 'Copy value'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Copy state value"
      @click.stop="copyEntryValue(entry)"
    >
      <span class="i-carbon-copy text-4" aria-hidden="true" />
    </button>
    <button
      v-tooltip.bottom="copied === 'path' ? 'Copied path' : 'Copy path'"
      class="h-5 w-5 shrink-0 rounded-1 border-0 bg-transparent p-0.5 color-muted flex items-center justify-center hover:bg-active hover:color-base"
      type="button"
      aria-label="Copy state path"
      @click.stop="copyEntryPath(entry)"
    >
      <span class="i-carbon-flow-data text-4" aria-hidden="true" />
    </button>
  </div>
</template>

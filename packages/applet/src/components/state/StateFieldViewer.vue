<script setup lang="ts">
import type { CustomInspectorState, InspectorCustomState } from '@vue/devtools-kit'
import type { EditorAddNewPropType } from '~/composables/state-editor'
import { rpc } from '@vue/devtools-core'
import { DevToolsV6PluginAPIHookKeys, DevToolsV6PluginAPIHookPayloads, escape, formatInspectorStateValue, getInspectorStateValueType, getRaw, toEdit, toSubmit } from '@vue/devtools-kit'
import { isArray, isObject, sortByKey } from '@vue/devtools-shared'
import { vTooltip, VueButton, VueIcon } from '@vue/devtools-ui'
import { computed, ref, watch } from 'vue'
import ToggleExpanded from '~/components/basic/ToggleExpanded.vue'
import { useHover } from '~/composables/hover'
import { useStateEditor, useStateEditorContext, useStateEditorDrafting } from '~/composables/state-editor'
import { useToggleExpanded } from '~/composables/toggle-expanded'
import ChildStateViewer from './ChildStateViewer.vue'
import StateFieldEditor from './StateFieldEditor.vue'
import StateFieldInputEditor from './StateFieldInputEditor.vue'

const props = defineProps<{
  data: CustomInspectorState
  depth: number
  index: string
  expandedStateId?: string
}>()

const STATE_FIELDS_LIMIT_SIZE = 30
const limit = ref(STATE_FIELDS_LIMIT_SIZE)
// display value
const displayedValue = computed(() => formatInspectorStateValue(props.data.value, false, {
  customClass: {
    string: 'max-w-120 truncate',
  },
}))
const type = computed(() => getInspectorStateValueType(props.data.value))
const raw = computed(() => getRaw(props.data.value))
const { expanded, toggleExpanded } = useToggleExpanded(props.expandedStateId ?? '')

// custom state format class
const stateFormatClass = computed(() => {
  if (type.value === 'custom')
    return `${(props.data.value as InspectorCustomState)._custom?.type ?? 'string'}-custom-state`
  else
    return 'unknown-state-type'
})

const fieldsCount = computed(() => {
  const { value } = raw.value
  if (isArray(value))
    return value.length
  else if (isObject(value))
    return Object.keys(value).length
  else
    return 0
})
const normalizedPath = computed(() => props.data.path || [props.data.key])
// normalized display key
const normalizedDisplayedKey = computed(() => normalizedPath.value[normalizedPath.value.length - 1])

// normalized display value
const normalizedDisplayedValue = computed(() => {
  const directlyDisplayedValueMap = ['Reactive']
  const extraDisplayedValue = (props.data.value as InspectorCustomState)?._custom?.stateTypeName || props.data?.stateTypeName
  if (directlyDisplayedValueMap.includes(extraDisplayedValue as string)) {
    return extraDisplayedValue
  }

  else if ((props.data.value as InspectorCustomState['_custom'])?.fields?.abstract) {
    return ''
  }

  else {
    const _type = (props.data.value as InspectorCustomState)?._custom?.type
    const _value = type.value === 'custom' && !_type ? `"${displayedValue.value}"` : (displayedValue.value === '' ? `""` : displayedValue.value)
    const normalizedType = type.value === 'custom' && _type === 'ref' ? getInspectorStateValueType(_value) : type.value
    const selectText = type.value === 'string' ? 'select-text' : ''
    const result = `<span title="${type.value === 'string' ? escape(props.data.value as unknown as string) : ''}" class="${normalizedType}-state-type flex whitespace-nowrap ${selectText}">${_value}</span>`

    if (extraDisplayedValue)
      return `${result} <span class="text-gray-500">(${extraDisplayedValue})</span>`

    return result
  }
})

// normalized display children
const normalizedDisplayedChildren = computed(() => {
  const { value, inherit, customType } = raw.value
  // The member in native set can only be added or removed.
  // It cannot be modified.
  const isUneditableType = customType === 'set'
  let displayedChildren: unknown[] = []
  if (isArray(value)) {
    const sliced = value.slice(0, limit.value)
    return sliced.map((item, i) => ({
      key: i.toString(),
      path: [...normalizedPath.value, i.toString()],
      value: item,
      ...inherit,
      editable: props.data.editable && !isUneditableType,
      creating: false,
    })) as unknown as CustomInspectorState[]
  }
  else if (isObject(value)) {
    displayedChildren = Object.keys(value).slice(0, limit.value).map(key => ({
      key,
      path: [...normalizedPath.value, key],
      value: value[key],
      ...inherit,
      editable: props.data.editable && !isUneditableType,
      creating: false,
    }))
    if (type.value !== 'custom')
      displayedChildren = sortByKey(displayedChildren)
  }

  return (displayedChildren === props.data.value ? [] : displayedChildren) as CustomInspectorState[]
})

// has children
const hasChildren = computed(() => {
  return normalizedDisplayedChildren.value.length > 0
})

// #region editor
const containerRef = ref<HTMLDivElement>()
const state = useStateEditorContext()
const { isHovering } = useHover(() => containerRef.value)

const { editingType, editing, editingText, toggleEditing, nodeId } = useStateEditor()

watch(() => editing.value, (v) => {
  if (v) {
    const { value } = raw.value
    editingText.value = toEdit(value, raw.value.customType)
  }
  else {
    editingText.value = ''
  }
})

async function submit() {
  const data = props.data
  await rpc.value.editInspectorState({
    path: normalizedPath.value,
    inspectorId: state.value.inspectorId,
    type: data.stateType!,
    nodeId: nodeId.value,
    state: {
      newKey: null!,
      type: editingType.value,
      value: toSubmit(editingText.value, raw.value.customType),
    },
  } as unknown as DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE])
  await rpc.value.sendInspectorState(state.value.inspectorId)
  toggleEditing()
}

// ------ add new prop ------
const { addNewProp: addNewPropApi, draftingNewProp, resetDrafting } = useStateEditorDrafting()

function addNewProp(type: EditorAddNewPropType) {
  const index = `${props.depth}-${props.index}`
  if (!expanded.value.includes(index))
    toggleExpanded(index)

  addNewPropApi(type, raw.value.value)
}

async function submitDrafting() {
  const data = props.data
  await rpc.value.editInspectorState({
    path: [...normalizedPath.value, draftingNewProp.value.key],
    inspectorId: state.value.inspectorId,
    type: data.stateType!,
    nodeId: nodeId.value,
    state: {
      newKey: draftingNewProp.value.key,
      type: typeof toSubmit(draftingNewProp.value.value),
      value: toSubmit(draftingNewProp.value.value),
    },
  } as unknown as DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE])
  await rpc.value.sendInspectorState(state.value.inspectorId)
  resetDrafting()
}

// #endregion
</script>

<template>
  <div>
    <div
      ref="containerRef"
      class="font-state-field flex items-center text-3.5"
      :class="[hasChildren && 'cursor-pointer hover:(bg-active)']"
      :style="{ paddingLeft: `${depth * 15 + 4}px` }"
      @click="toggleExpanded(`${depth}-${index}`)"
    >
      <ToggleExpanded
        v-if="hasChildren"
        :value="expanded.includes(`${depth}-${index}`)"
      />
      <!-- placeholder -->
      <span v-else pl5 />
      <span whitespace-nowrap text-purple-700 op70 dark:text-purple-300>
        {{ normalizedDisplayedKey }}
      </span>
      <span mx1>:</span>
      <StateFieldInputEditor v-if="editing" v-model="editingText" class="mr-1" :custom-type="raw.customType" @cancel="toggleEditing" @submit="submit" />
      <span :class="stateFormatClass" class="flex whitespace-nowrap dark:text-#bdc6cf">
        <span class="flex" v-html="normalizedDisplayedValue" />
      </span>
      <StateFieldEditor
        :hovering="isHovering" :disable-edit="state.disableEdit || editing"
        :data="data" :depth="depth" @enable-edit-input="toggleEditing"
        @add-new-prop="addNewProp"
      />
    </div>
    <div v-if="hasChildren && expanded.includes(`${depth}-${index}`)">
      <ChildStateViewer :data="normalizedDisplayedChildren" :depth="depth" :index="index" />
      <VueButton v-if="fieldsCount > limit" v-tooltip="'Show more'" flat size="mini" class="ml-4" @click="limit += STATE_FIELDS_LIMIT_SIZE">
        <template #icon>
          <VueIcon icon="i-material-symbols-more-horiz" />
        </template>
      </VueButton>
      <div v-if="draftingNewProp.enable" :style="{ paddingLeft: `${(depth + 1) * 15 + 4}px` }">
        <span overflow-hidden text-ellipsis whitespace-nowrap state-key>
          <StateFieldInputEditor v-model="draftingNewProp.key" :show-actions="false" />
        </span>
        <span mx-1>:</span>
        <StateFieldInputEditor v-model="draftingNewProp.value" :auto-focus="false" @cancel="resetDrafting" @submit="submitDrafting" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
// Maybe related https://github.com/vuejs/core/issues/12241
// Let's leave it global for now, until it's fixed
// This will compiled to `.dark[v-xxx] selectors` if using scoped
.function-custom-state {
  & > span {
    --at-apply: 'dark:text-#997fff!';
  }
}
</style>

<style lang="scss" scoped>
// string
:deep(.string-custom-state) {
  --at-apply: string-state-type;
}

// function
:deep(.function-custom-state) {
  --at-apply: font-italic;
  & > span {
    --at-apply: 'text-#0033cc dark:text-#997fff';
    font-family: Menlo, monospace;
  }
}

// component-definition
:deep(.component-definition-custom-state) {
  --at-apply: text-primary-500;
  & > span {
    --at-apply: 'text-#aaa';
  }
}

// component
:deep(.component-custom-state) {
  --at-apply: text-primary-500;
  &::before {
    content: '<';
  }
  &::after {
    content: '>';
  }
  &::before,
  &::after {
    --at-apply: 'text-#aaa';
  }
}

// native error
:deep(.native.Error-state-type) {
  --at-apply: 'text-red-500';
  &::before {
    content: 'Error:';
    margin-right: 4px;
  }
}
</style>

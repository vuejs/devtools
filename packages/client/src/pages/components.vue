<script setup lang="ts">
import AppList from '@components/components/AppList.vue'
import RenderCode from '@components/components/RenderCode.vue'
import InspectorState from '@components/common/InspectorState.vue'
import InspectorTree from '@components/common/InspectorTree.vue'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildComponentTree } from '../composables/component-tree'
import {
  findPreferredComponent,
  persistComponentSelection,
  readFavoriteComponentKeys,
  readStoredComponentSelection,
  toggleFavoriteComponent,
} from '../composables/component-tree-preferences'
import { useDevtoolsClient } from '../composables/devtools-client'
import { useDevtoolsSettings } from '../composables/settings'

interface ComponentPageAction {
  icon: string
  tooltip: string
  ariaLabel?: string
  active?: boolean
  pressed?: boolean
  rounded?: 'sm' | 'full'
  run: () => Promise<void> | void
}

const {
  apps,
  cancelComponentInspection,
  cancelComponentTreeExpansion,
  components,
  componentInspecting,
  componentState,
  componentStateLoading,
  error,
  expandComponentTreeNode,
  getSelectedComponentRenderCode,
  highlightComponent,
  inspectComponentInPage,
  inspectSelectedComponentDom,
  openSelectedComponentInEditor,
  openInEditorAvailable,
  scrollToSelectedComponent,
  selectComponent: setSelectedComponent,
  selectedComponent,
  selectedComponentId,
  selectedApp,
  routerSnapshot,
  showMoreComponentStateEntries,
  unhighlightComponent,
} = useDevtoolsClient()
const { settings } = useDevtoolsSettings()
const container = ref<HTMLElement>()
const horizontal = ref(false)
const filterComponentName = ref('')
const filterStateName = ref('')
const componentRenderCode = ref('')
const componentRenderCodeVisible = ref(false)
const favoriteComponentKeys = ref<Set<string>>(new Set())

let observer: ResizeObserver | undefined
let restoredSelectionScope = ''

const componentRoutePath = computed(
  () =>
    routerSnapshot.value.currentRoute?.path ?? routerSnapshot.value.currentRoute?.fullPath ?? '/',
)
const componentSelectionScope = computed(
  () =>
    `${selectedApp.value?.id ?? 'default'}:${selectedApp.value?.name ?? 'app'}:${componentRoutePath.value}`,
)

const componentTreeNodes = computed(() =>
  buildComponentTree(
    components.value,
    filterComponentName.value,
    favoriteComponentKeys.value,
    settings.highlightUpdates,
  ),
)

const selectedComponentNode = computed(() =>
  selectedComponent.value
    ? {
        id: selectedComponent.value.id,
        label: selectedComponent.value.name,
      }
    : undefined,
)

const componentTreeActions = computed<ComponentPageAction[]>(() => [
  {
    icon:
      filterComponentName.value.trim() === 'is:favorite' ? 'i-carbon-star-filled' : 'i-carbon-star',
    tooltip:
      filterComponentName.value.trim() === 'is:favorite'
        ? 'Show all components'
        : 'Show favorite components',
    ariaLabel: 'Toggle favorite components filter',
    active: filterComponentName.value.trim() === 'is:favorite',
    pressed: filterComponentName.value.trim() === 'is:favorite',
    rounded: 'full',
    run: toggleFavoriteFilter,
  },
  {
    icon: 'i-carbon-select-window',
    tooltip: componentInspecting.value
      ? 'Cancel selecting component'
      : 'Select component in the page',
    ariaLabel: 'Select component in the page',
    active: componentInspecting.value,
    pressed: componentInspecting.value,
    rounded: 'full',
    run: inspectComponent,
  },
])

watch(
  [selectedApp, componentRoutePath, components],
  ([app, routePath, nodes]) => {
    if (!app || !nodes.length) return
    const appScope = `${app.id}:${app.name}`
    const scope = `${appScope}:${routePath}`
    const selectedExists = nodes.some((component) => component.id === selectedComponentId.value)
    if (scope === restoredSelectionScope && selectedExists) return

    favoriteComponentKeys.value = readFavoriteComponentKeys(appScope)
    const preferred = findPreferredComponent(
      nodes,
      readStoredComponentSelection(appScope, routePath),
    )
    restoredSelectionScope = scope
    if (preferred && preferred.id !== selectedComponentId.value) setSelectedComponent(preferred.id)
  },
  { immediate: true },
)

const componentStateActions = computed<ComponentPageAction[]>(() => {
  const component = selectedComponent.value
  if (!component) return []

  const actions: ComponentPageAction[] = [
    {
      icon: 'i-carbon-view',
      tooltip: 'Scroll to component',
      ariaLabel: 'Scroll to component',
      run: scrollToComponent,
    },
    {
      icon: 'i-carbon-code',
      tooltip: 'Show render code',
      ariaLabel: 'Show render code',
      run: showComponentRenderCode,
    },
  ]

  if (component.file && openInEditorAvailable.value) {
    actions.push({
      icon: 'i-carbon-launch',
      tooltip: 'Open in Editor',
      ariaLabel: 'Open component source in editor',
      run: openComponentInEditor,
    })
  }

  actions.push({
    icon: 'i-carbon-debug',
    tooltip: 'Inspect DOM',
    ariaLabel: 'Inspect DOM',
    run: inspectComponentDom,
  })

  return actions
})

watch(selectedComponentId, () => {
  componentRenderCode.value = ''
  componentRenderCodeVisible.value = false
})

async function selectComponent(componentId: string) {
  persistSelectedComponent(componentId)
  setSelectedComponent(componentId)
  await nextTick()
}

async function inspectComponent() {
  if (componentInspecting.value) {
    await cancelComponentInspection()
    return
  }

  const result = await inspectComponentInPage()
  if (!result) return

  filterComponentName.value = ''
  await selectComponent(result.componentId)
}

function toggleFavoriteFilter() {
  filterComponentName.value =
    filterComponentName.value.trim() === 'is:favorite' ? '' : 'is:favorite'
}

function toggleComponentFavorite(componentId: string) {
  const app = selectedApp.value
  const component = components.value.find((item) => item.id === componentId)
  if (!app || !component) return
  favoriteComponentKeys.value = toggleFavoriteComponent(`${app.id}:${app.name}`, component)
}

function persistSelectedComponent(componentId: string) {
  const app = selectedApp.value
  const component = components.value.find((item) => item.id === componentId)
  if (!app || !component) return
  persistComponentSelection(`${app.id}:${app.name}`, componentRoutePath.value, component)
}

async function scrollToComponent() {
  await runComponentAction(scrollToSelectedComponent)
}

async function inspectComponentDom() {
  await runComponentAction(inspectSelectedComponentDom)
}

async function openComponentInEditor() {
  await runComponentAction(openSelectedComponentInEditor)
}

async function showComponentRenderCode() {
  await runComponentAction(async () => {
    const code = await getSelectedComponentRenderCode()
    if (!code) return
    componentRenderCode.value = code
    componentRenderCodeVisible.value = true
  })
}

async function runComponentAction(action: () => Promise<void>) {
  try {
    await action()
  } catch {}
}

function runComponentTreeAction(index: number) {
  void componentTreeActions.value[index]?.run()
}

function runComponentStateAction(index: number) {
  void componentStateActions.value[index]?.run()
}

function handleComponentsKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return

  if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void inspectComponent()
    return
  }

  if (event.key === 'Escape' && componentInspecting.value) {
    event.preventDefault()
    void cancelComponentInspection()
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    horizontal.value = entry.contentRect.width < 700
  })
  if (container.value) observer.observe(container.value)
  window.addEventListener('keydown', handleComponentsKeydown)
})

onUnmounted(() => {
  cancelComponentTreeExpansion()
  observer?.disconnect()
  window.removeEventListener('keydown', handleComponentsKeydown)
  if (componentInspecting.value) void cancelComponentInspection()
  void unhighlightComponent()
})
</script>

<template>
  <section ref="container" class="h-full min-h-0">
    <Splitpanes class="h-full min-h-0 overflow-hidden" :horizontal="horizontal">
      <Pane v-if="apps.length > 1" class="h-full min-h-0" min-size="12" size="18">
        <AppList />
      </Pane>

      <Pane class="h-full min-h-0" min-size="18" size="25">
        <InspectorTree
          v-model:filter="filterComponentName"
          :actions="componentTreeActions"
          component-labels
          :default-expand-depth="2"
          :empty-text="error ?? 'No components'"
          :nodes="componentTreeNodes"
          no-matching-text="No matching components"
          placeholder="Find components..."
          :selected-node-id="selectedComponentId"
          :state-key="componentSelectionScope"
          :refresh-visible="false"
          @action="runComponentTreeAction"
          @expand="(componentId) => void expandComponentTreeNode(componentId)"
          @collapse="cancelComponentTreeExpansion"
          @hover="(componentId) => void highlightComponent(componentId)"
          @leave="() => void unhighlightComponent()"
          @select="(componentId) => void selectComponent(componentId)"
          @toggle-favorite="toggleComponentFavorite"
        />
      </Pane>

      <Pane class="h-full min-h-0" min-size="28">
        <InspectorState
          v-model:filter="filterStateName"
          empty-text="No state entries"
          filter-placeholder="Filter State..."
          :loading="componentStateLoading"
          loading-text="Loading state"
          :node-actions="componentStateActions"
          no-matching-text="No matching state entries"
          no-selection-text="No component selected"
          select-prompt="Select a component"
          selected-label-mode="component"
          :selected-node="selectedComponentNode"
          :selected-node-id="selectedComponentId"
          show-more-text="Show more"
          :state="componentState"
          @node-action="runComponentStateAction"
          @show-more="() => void showMoreComponentStateEntries()"
        >
          <RenderCode
            v-if="componentRenderCodeVisible && componentRenderCode"
            :code="componentRenderCode"
            @close="componentRenderCodeVisible = false"
          />
        </InspectorState>
      </Pane>
    </Splitpanes>
  </section>
</template>

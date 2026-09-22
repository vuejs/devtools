<script setup lang="ts">
import AppList from '@components/components/AppList.vue'
import ReactivityGraph from '@components/components/ReactivityGraph.vue'
import InspectorTree from '@components/common/InspectorTree.vue'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { buildComponentTree } from '../composables/component-tree'
import { useDevtoolsClient } from '../composables/devtools-client'

interface GraphPageAction {
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
  componentInspecting,
  components,
  componentState,
  componentStateLoading,
  error,
  highlightComponent,
  inspectComponentInPage,
  reactivityGraphEnabled,
  selectComponent: setSelectedComponent,
  selectedComponent,
  selectedComponentId,
  unhighlightComponent,
} = useDevtoolsClient()

const container = ref<HTMLElement>()
const horizontal = ref(false)
const filterComponentName = ref('')

let observer: ResizeObserver | undefined

const componentTreeNodes = computed(() =>
  buildComponentTree(components.value, filterComponentName.value),
)
const graph = computed(() => componentState.value?.reactivityGraph)
const graphEmptyText = computed(() => {
  if (!reactivityGraphEnabled.value) return 'Reactivity Graph requires Vue 3.6 or later.'
  if (!selectedComponent.value) return 'Select a component to inspect its reactivity graph.'
  if (componentStateLoading.value) return 'Loading reactivity graph...'
  return 'No data'
})
const componentTreeActions = computed<GraphPageAction[]>(() => [
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

async function selectComponent(componentId: string) {
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
  setSelectedComponent(result.componentId)
  await nextTick()
}

function runComponentTreeAction(index: number) {
  void componentTreeActions.value[index]?.run()
}

function handleGraphKeydown(event: KeyboardEvent) {
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
    horizontal.value = entry.contentRect.width < 760
  })
  if (container.value) observer.observe(container.value)
  window.addEventListener('keydown', handleGraphKeydown)
})

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', handleGraphKeydown)
  if (componentInspecting.value) void cancelComponentInspection()
  void unhighlightComponent()
})
</script>

<template>
  <section ref="container" class="h-full min-h-0">
    <Splitpanes class="h-full min-h-0 overflow-hidden" :horizontal="horizontal">
      <Pane class="h-full min-h-0" min-size="16" :size="horizontal ? 34 : 18">
        <div class="h-full min-h-0 flex flex-col">
          <div v-if="apps.length > 1" class="max-h-38 shrink-0 border-b border-base">
            <AppList />
          </div>

          <div class="min-h-0 flex-1">
            <InspectorTree
              v-model:filter="filterComponentName"
              :actions="componentTreeActions"
              component-labels
              :default-expand-depth="99"
              :empty-text="error ?? 'No components'"
              :nodes="componentTreeNodes"
              no-matching-text="No matching components"
              placeholder="Find components..."
              :selected-node-id="selectedComponentId"
              state-key="reactivity-graph-components"
              :refresh-visible="false"
              @action="runComponentTreeAction"
              @hover="(componentId) => void highlightComponent(componentId)"
              @leave="() => void unhighlightComponent()"
              @select="(componentId) => void selectComponent(componentId)"
            />
          </div>
        </div>
      </Pane>

      <Pane class="h-full min-h-0" min-size="32">
        <ReactivityGraph v-if="reactivityGraphEnabled && graph?.nodes.length" :graph="graph" />
        <div v-else class="h-full min-h-0 flex items-center justify-center bg-subtle p-6">
          <p class="m-0 max-w-78 text-center color-muted text-3.5 leading-5">
            {{ graphEmptyText }}
          </p>
        </div>
      </Pane>
    </Splitpanes>
  </section>
</template>

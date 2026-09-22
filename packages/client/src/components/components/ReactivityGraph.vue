<script setup lang="ts">
import type { ReactivityGraphNodeType, ReactivityGraphSnapshot } from '@vue/devtools-kit'
import { computed, ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import ReactivityGraphToolbar from './ReactivityGraphToolbar.vue'
import ReactivityGraphCanvas from './ReactivityGraphCanvas.vue'
import ReactivityGraphDetails from './ReactivityGraphDetails.vue'
import {
  buildRelationshipPath,
  emptyRelationshipPath,
  indexGraphRelationships,
  type RelationshipPathResult,
} from '../../utils/reactivity-graph-paths'
import {
  TYPE_LEGEND_TYPES,
  normalizeSearch,
  matchesGraphSearch,
} from '../../utils/reactivity-graph-display'
const props = defineProps<{ graph: ReactivityGraphSnapshot }>()
const selectedNodeId = ref<string>()

const dependencyDepth = ref(1)

const graphSearch = ref('')

const activeTypeFilters = ref<Set<ReactivityGraphNodeType>>(new Set(TYPE_LEGEND_TYPES))

const pathSelectorOpen = ref(false)

const pathStartId = ref('')

const pathEndId = ref('')

const filteredGraph = computed<ReactivityGraphSnapshot>(() => {
  const query = normalizeSearch(graphSearch.value)
  const activeTypes = activeTypeFilters.value
  const nodes = props.graph.nodes.filter((node) => {
    return activeTypes.has(node.type) && matchesGraphSearch(node, query)
  })
  const nodeIds = new Set(nodes.map((node) => node.id))
  const relationships = props.graph.relationships.filter(
    (relationship) => nodeIds.has(relationship.from) && nodeIds.has(relationship.to),
  )

  return { nodes, relationships }
})

const relationshipsBySource = computed(() =>
  indexGraphRelationships(filteredGraph.value.relationships),
)

const pathModeActive = computed(() => !!pathStartId.value && !!pathEndId.value)

const selectedRelationshipPath = computed<RelationshipPathResult>(() => {
  if (!pathModeActive.value) return emptyRelationshipPath()
  return buildRelationshipPath(pathStartId.value, pathEndId.value, relationshipsBySource.value)
})
function selectGraphNode(nodeId: string) {
  pathSelectorOpen.value = false
  pathStartId.value = ''
  pathEndId.value = ''
  selectedNodeId.value = nodeId
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-base">
    <ReactivityGraphToolbar
      v-model:search="graphSearch"
      v-model:active-types="activeTypeFilters"
      v-model:path-selector-open="pathSelectorOpen"
      v-model:path-start-id="pathStartId"
      v-model:path-end-id="pathEndId"
      v-model:selected-node-id="selectedNodeId"
      :graph="graph"
      :filtered-graph="filteredGraph"
    />
    <Splitpanes class="min-h-0 flex-1 overflow-hidden">
      <Pane class="h-full min-h-0" min-size="30" size="53.333">
        <ReactivityGraphCanvas
          v-model:selected-node-id="selectedNodeId"
          v-model:dependency-depth="dependencyDepth"
          :graph="filteredGraph"
          :path="pathModeActive ? selectedRelationshipPath : undefined"
          :path-selector-open="pathSelectorOpen"
          @select="selectGraphNode"
        />
      </Pane>
      <Pane class="h-full min-h-0" min-size="24" size="46.667">
        <ReactivityGraphDetails
          :graph="graph"
          :filtered-graph="filteredGraph"
          :selected-node-id="selectedNodeId"
          :dependency-depth="dependencyDepth"
          :path="pathModeActive ? selectedRelationshipPath : undefined"
          @select="selectGraphNode"
        />
      </Pane>
    </Splitpanes>
  </div>
</template>

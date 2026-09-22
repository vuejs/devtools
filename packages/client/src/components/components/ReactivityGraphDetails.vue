<script setup lang="ts">
import type {
  ReactivityGraphNode,
  ReactivityGraphSnapshot,
  ReactivityRelationship,
} from '@vue/devtools-kit'
import { computed, toRef } from 'vue'
import DevtoolsIcon from '../common/DevtoolsIcon.vue'
import { displayNodeLabel } from '../../utils/reactivity-graph-layout'
import { typeColor, nodeTypeLabel, formatNodeValue } from '../../utils/reactivity-graph-display'
import {
  emptyRelationshipPath,
  type RelationshipPathResult,
} from '../../utils/reactivity-graph-paths'
const props = defineProps<{
  graph: ReactivityGraphSnapshot
  filteredGraph: ReactivityGraphSnapshot
  selectedNodeId?: string
  dependencyDepth: number
  path?: RelationshipPathResult
}>()
const emit = defineEmits<{ select: [nodeId: string] }>()
const selectedNodeId = toRef(props, 'selectedNodeId')
const dependencyDepth = toRef(props, 'dependencyDepth')
const filteredGraph = toRef(props, 'filteredGraph')
const nodes = computed(() => props.filteredGraph.nodes)
const relationships = computed(() => props.filteredGraph.relationships)
const pathModeActive = computed(() => !!props.path)
const selectedRelationshipPath = computed(() => props.path ?? emptyRelationshipPath())
function selectGraphNode(nodeId: string) {
  emit('select', nodeId)
}
interface GraphStateRow {
  key: string
  value: string
  valueClass: string
}

type RelationshipDetailSide = 'dependency' | 'subscriber'

interface RelationshipDetailTraversal {
  depthById: Map<string, number>
  layers: ReactivityGraphNode[][]
}

interface RelationshipDetailLayoutNode {
  depth: number
  node: ReactivityGraphNode
  side: RelationshipDetailSide
  x: number
  y: number
}

interface RelationshipDetailLayoutLink {
  id: string
  path: string
}

const RELATIONSHIP_DETAIL_MAX_NODES = 20

const RELATIONSHIP_DETAIL_SPACING = {
  width: 180,
  height: 30,
  padding: 4,
  columnGap: 52,
  canvasPadding: 16,
  dot: 16,
}

const snapshotNodeById = computed(() => new Map(props.graph.nodes.map((node) => [node.id, node])))

const selectedPathNodes = computed(() =>
  selectedRelationshipPath.value.orderedNodeIds
    .map((nodeId) => snapshotNodeById.value.get(nodeId))
    .filter((node): node is ReactivityGraphNode => node !== undefined),
)

const selectedPathRelationships = computed(() => {
  const relationshipById = new Map(
    filteredGraph.value.relationships.map((relationship) => [relationship.id, relationship]),
  )
  return selectedRelationshipPath.value.orderedRelationshipIds
    .map((relationshipId) => relationshipById.get(relationshipId))
    .filter((relationship): relationship is ReactivityRelationship => relationship !== undefined)
})

const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])))

const selectedNode = computed(() => nodes.value.find((node) => node.id === selectedNodeId.value))

const selectedStateRows = computed(() =>
  selectedNodeId.value && snapshotNodeById.value.has(selectedNodeId.value)
    ? createGraphStateRows(snapshotNodeById.value.get(selectedNodeId.value)!)
    : [],
)

const relationshipDetailDependencyTraversal = computed(() =>
  buildRelationshipDetailTraversal('dependency'),
)

const relationshipDetailSubscriberTraversal = computed(() =>
  buildRelationshipDetailTraversal('subscriber'),
)

const relationshipDetailLayout = computed(() => buildRelationshipDetailLayout())

function relationshipDetailListHeight(count: number) {
  if (!count) return 0
  return (
    RELATIONSHIP_DETAIL_SPACING.height * count + RELATIONSHIP_DETAIL_SPACING.padding * (count + 1)
  )
}

function buildRelationshipDetailTraversal(
  side: RelationshipDetailSide,
): RelationshipDetailTraversal {
  const layers: ReactivityGraphNode[][] = []
  const depthById = new Map<string, number>()
  const startId = selectedNodeId.value
  if (!startId) return { depthById, layers }

  const visited = new Set([startId])
  let frontier = new Set([startId])
  let nodeCount = 0

  for (let depth = 1; depth <= dependencyDepth.value && frontier.size; depth += 1) {
    const nextIds: string[] = []
    const nextSeen = new Set<string>()

    for (const relationship of relationships.value) {
      const candidateId = side === 'dependency' ? relationship.from : relationship.to
      const frontierId = side === 'dependency' ? relationship.to : relationship.from
      if (!frontier.has(frontierId)) continue
      if (visited.has(candidateId) || nextSeen.has(candidateId)) continue
      if (!nodeById.value.has(candidateId)) continue

      nextIds.push(candidateId)
      nextSeen.add(candidateId)
      if (nodeCount + nextIds.length >= RELATIONSHIP_DETAIL_MAX_NODES) break
    }

    const layer = nextIds
      .slice(0, RELATIONSHIP_DETAIL_MAX_NODES - nodeCount)
      .map((nodeId) => nodeById.value.get(nodeId))
      .filter((node): node is ReactivityGraphNode => node !== undefined)

    if (!layer.length) break

    for (const node of layer) {
      visited.add(node.id)
      depthById.set(node.id, depth)
    }

    layers.push(layer)
    nodeCount += layer.length
    frontier = new Set(layer.map((node) => node.id))

    if (nodeCount >= RELATIONSHIP_DETAIL_MAX_NODES) break
  }

  return { depthById, layers }
}

function buildRelationshipDetailLayout() {
  const startId = selectedNodeId.value
  if (!startId) {
    return {
      centerX: RELATIONSHIP_DETAIL_SPACING.canvasPadding + RELATIONSHIP_DETAIL_SPACING.dot / 2,
      centerY: RELATIONSHIP_DETAIL_SPACING.dot / 2,
      height: RELATIONSHIP_DETAIL_SPACING.dot,
      links: [] satisfies RelationshipDetailLayoutLink[],
      nodes: [] satisfies RelationshipDetailLayoutNode[],
      width: RELATIONSHIP_DETAIL_SPACING.canvasPadding * 2 + RELATIONSHIP_DETAIL_SPACING.dot,
    }
  }

  const dependencyLayers = relationshipDetailDependencyTraversal.value.layers
  const dependencyDepthById = relationshipDetailDependencyTraversal.value.depthById
  const subscriberLayers = relationshipDetailSubscriberTraversal.value.layers
  const subscriberDepthById = relationshipDetailSubscriberTraversal.value.depthById
  const columnStep = RELATIONSHIP_DETAIL_SPACING.width + RELATIONSHIP_DETAIL_SPACING.columnGap
  const centerX =
    RELATIONSHIP_DETAIL_SPACING.canvasPadding +
    subscriberLayers.length * columnStep +
    RELATIONSHIP_DETAIL_SPACING.dot / 2
  const width =
    RELATIONSHIP_DETAIL_SPACING.canvasPadding * 2 +
    subscriberLayers.length * columnStep +
    RELATIONSHIP_DETAIL_SPACING.dot +
    dependencyLayers.length * columnStep
  const height = Math.max(
    RELATIONSHIP_DETAIL_SPACING.dot,
    ...subscriberLayers.map((layer) => relationshipDetailListHeight(layer.length)),
    ...dependencyLayers.map((layer) => relationshipDetailListHeight(layer.length)),
  )
  let centerY = height / 2
  const nodes: RelationshipDetailLayoutNode[] = []
  const firstLayerYs: number[] = []
  const positions = new Map<string, { node?: RelationshipDetailLayoutNode; x: number; y: number }>()

  subscriberLayers.forEach((layer, layerIndex) => {
    const depth = layerIndex + 1
    const layerHeight = relationshipDetailListHeight(layer.length)
    const top = (height - layerHeight) / 2 + RELATIONSHIP_DETAIL_SPACING.padding
    const x =
      centerX -
      RELATIONSHIP_DETAIL_SPACING.dot / 2 -
      RELATIONSHIP_DETAIL_SPACING.columnGap -
      RELATIONSHIP_DETAIL_SPACING.width -
      layerIndex * columnStep

    layer.forEach((node, nodeIndex) => {
      const y =
        top +
        nodeIndex * (RELATIONSHIP_DETAIL_SPACING.height + RELATIONSHIP_DETAIL_SPACING.padding) +
        RELATIONSHIP_DETAIL_SPACING.height / 2
      const item: RelationshipDetailLayoutNode = { depth, node, side: 'subscriber', x, y }
      nodes.push(item)
      if (layerIndex === 0) firstLayerYs.push(y)
      positions.set(node.id, { node: item, x, y })
    })
  })

  dependencyLayers.forEach((layer, layerIndex) => {
    const depth = layerIndex + 1
    const layerHeight = relationshipDetailListHeight(layer.length)
    const top = (height - layerHeight) / 2 + RELATIONSHIP_DETAIL_SPACING.padding
    const x =
      centerX +
      RELATIONSHIP_DETAIL_SPACING.dot / 2 +
      RELATIONSHIP_DETAIL_SPACING.columnGap +
      layerIndex * columnStep

    layer.forEach((node, nodeIndex) => {
      const y =
        top +
        nodeIndex * (RELATIONSHIP_DETAIL_SPACING.height + RELATIONSHIP_DETAIL_SPACING.padding) +
        RELATIONSHIP_DETAIL_SPACING.height / 2
      const item: RelationshipDetailLayoutNode = { depth, node, side: 'dependency', x, y }
      nodes.push(item)
      if (layerIndex === 0) firstLayerYs.push(y)
      positions.set(node.id, { node: item, x, y })
    })
  })

  if (firstLayerYs.length) {
    centerY = (Math.min(...firstLayerYs) + Math.max(...firstLayerYs)) / 2
  }

  positions.set(startId, { x: centerX, y: centerY })

  const links: RelationshipDetailLayoutLink[] = []
  for (const relationship of relationships.value) {
    const dependencyDepth = dependencyDepthById.get(relationship.from)
    const dependencyParentDepth =
      relationship.to === startId ? 0 : dependencyDepthById.get(relationship.to)
    if (
      dependencyDepth !== undefined &&
      dependencyParentDepth !== undefined &&
      dependencyDepth === dependencyParentDepth + 1
    ) {
      const source = positions.get(relationship.to)
      const target = positions.get(relationship.from)
      if (source && target) {
        links.push({
          id: `dependency:${relationship.id}`,
          path: relationshipDetailPath(
            relationshipDetailRightEdge(source),
            source.y,
            target.x,
            target.y,
          ),
        })
      }
    }

    const subscriberDepth = subscriberDepthById.get(relationship.to)
    const subscriberParentDepth =
      relationship.from === startId ? 0 : subscriberDepthById.get(relationship.from)
    if (
      subscriberDepth !== undefined &&
      subscriberParentDepth !== undefined &&
      subscriberDepth === subscriberParentDepth + 1
    ) {
      const source = positions.get(relationship.to)
      const target = positions.get(relationship.from)
      if (source && target) {
        links.push({
          id: `subscriber:${relationship.id}`,
          path: relationshipDetailPath(
            relationshipDetailRightEdge(source),
            source.y,
            relationshipDetailLeftEdge(target),
            target.y,
          ),
        })
      }
    }
  }

  return { centerX, centerY, height, links, nodes, width }
}

function relationshipDetailLeftEdge(position: { node?: RelationshipDetailLayoutNode; x: number }) {
  return position.node ? position.x : position.x - RELATIONSHIP_DETAIL_SPACING.dot / 2
}

function relationshipDetailRightEdge(position: { node?: RelationshipDetailLayoutNode; x: number }) {
  return position.node
    ? position.x + RELATIONSHIP_DETAIL_SPACING.width
    : position.x + RELATIONSHIP_DETAIL_SPACING.dot / 2
}

function relationshipDetailPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const midX = (sourceX + targetX) / 2
  return `M ${sourceX} ${sourceY} C ${midX} ${sourceY} ${midX} ${targetY} ${targetX} ${targetY}`
}

function createGraphStateRows(node: ReactivityGraphNode): GraphStateRow[] {
  const value = formatNodeValue(node)
  return [
    {
      key: 'key',
      value: formatStateString(displayNodeLabel(node)),
      valueClass: 'string-state-type',
    },
    {
      key: 'type',
      value: formatStateString(nodeTypeLabel(node.type)),
      valueClass: 'string-state-type',
    },
    {
      key: 'value',
      value: value || 'undefined',
      valueClass: value ? getGraphStateValueClass(value) : 'null-state-type',
    },
  ]
}

function formatStateString(value: string) {
  return JSON.stringify(value)
}

function getGraphStateValueClass(value: string) {
  if (value === 'null' || value === 'undefined') return 'null-state-type'
  if (value === 'true' || value === 'false') return 'boolean-state-type'
  if (value.startsWith('"')) return 'string-state-type'
  if (/^-?\d/.test(value) || value.startsWith('Symbol(')) return 'literal-state-type'
  return 'state-value'
}

function formatGraphValue(node: ReactivityGraphNode) {
  const value = formatNodeValue(node)
  if (!value) return ''
  return value.length > 28 ? `${value.slice(0, 27)}...` : value
}
</script>

<template>
  <aside class="h-full min-w-0 overflow-auto p-3">
    <template v-if="pathModeActive">
      <section>
        <div v-if="selectedPathNodes.length" class="grid gap-0.5">
          <template v-for="(node, index) in selectedPathNodes" :key="node.id">
            <button
              class="min-w-0 rounded-1 border border-base bg-base px-2 py-1.5 text-left color-base flex items-center gap-2 hover:bg-active"
              type="button"
              @click="selectGraphNode(node.id)"
            >
              <span class="w-4 shrink-0 text-right color-muted font-state-field text-3">
                {{ index + 1 }}
              </span>
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ background: typeColor(node.type) }"
              />
              <span
                v-tooltip.top="formatNodeValue(node)"
                class="min-w-0 flex-1 truncate font-state-field text-3.5"
              >
                <span>
                  {{ displayNodeLabel(node) }}
                </span>
                <span v-if="formatGraphValue(node)" class="color-muted">
                  ({{ formatGraphValue(node) }})
                </span>
              </span>
              <span class="shrink-0 color-muted text-3">
                {{ nodeTypeLabel(node.type) }}
              </span>
            </button>

            <div
              v-if="index < selectedPathRelationships.length"
              class="h-7 color-muted flex items-center justify-center"
            >
              <DevtoolsIcon icon="i-carbon-arrow-down" class="text-4" />
            </div>
          </template>
        </div>

        <div v-else class="h-28 flex items-center justify-center color-muted text-3.5 italic">
          No relationship path found
        </div>
      </section>
    </template>

    <template v-else-if="selectedNode">
      <section class="pb-4">
        <h2 class="mb-2 color-muted font-state-field text-3.5">Info</h2>

        <div class="grid gap-0.5">
          <div
            v-for="row in selectedStateRows"
            :key="row.key"
            class="font-state-field min-w-0 flex items-center text-3.5"
          >
            <span class="state-key shrink-0 overflow-hidden text-ellipsis whitespace-nowrap op70">
              {{ row.key }}
            </span>
            <span class="colon mx-1 shrink-0">:</span>
            <span
              v-tooltip.top="row.value"
              class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              :class="row.valueClass"
            >
              {{ row.value }}
            </span>
          </div>
        </div>
      </section>

      <section class="border-t border-base pt-4">
        <h2 class="mb-2 color-muted font-state-field text-3.5">Relationships</h2>

        <div class="overflow-x-auto pb-2">
          <div
            v-if="relationshipDetailLayout.nodes.length"
            class="relative select-none"
            :style="{
              width: `${relationshipDetailLayout.width}px`,
              height: `${relationshipDetailLayout.height}px`,
            }"
          >
            <svg
              pointer-events-none
              class="absolute left-0 top-0 z-10"
              :height="relationshipDetailLayout.height"
              :width="relationshipDetailLayout.width"
            >
              <g>
                <path
                  v-for="link in relationshipDetailLayout.links"
                  :key="link.id"
                  :d="link.path"
                  fill="none"
                  stroke="#888888"
                  stroke-opacity="0.34"
                />
              </g>
            </svg>

            <div
              class="absolute z-20 box-border rounded-full bg-base"
              :style="{
                top: `${relationshipDetailLayout.centerY - RELATIONSHIP_DETAIL_SPACING.dot / 2}px`,
                left: `${relationshipDetailLayout.centerX - RELATIONSHIP_DETAIL_SPACING.dot / 2}px`,
                width: `${RELATIONSHIP_DETAIL_SPACING.dot}px`,
                height: `${RELATIONSHIP_DETAIL_SPACING.dot}px`,
                border: `3px solid ${selectedNode ? typeColor(selectedNode.type) : typeColor('unknown')}`,
              }"
            />

            <button
              v-for="item in relationshipDetailLayout.nodes"
              :key="`${item.side}:${item.depth}:${item.node.id}`"
              v-tooltip.top="`${displayNodeLabel(item.node)} - ${nodeTypeLabel(item.node.type)}`"
              class="absolute z-20 min-w-0 block rounded-1 border border-base bg-base px-2 py-1 text-left color-base hover:bg-active"
              type="button"
              :style="{
                left: `${item.x}px`,
                top: `${item.y - RELATIONSHIP_DETAIL_SPACING.height / 2}px`,
                width: `${RELATIONSHIP_DETAIL_SPACING.width}px`,
                height: `${RELATIONSHIP_DETAIL_SPACING.height}px`,
                overflow: 'hidden',
              }"
              @click="selectGraphNode(item.node.id)"
            >
              <span class="min-w-0 flex items-center gap-1.5">
                <span
                  class="h-2.3 w-2.3 shrink-0 rounded-full"
                  :style="{ background: typeColor(item.node.type) }"
                />
                <span class="truncate font-state-field text-3.5">
                  {{ displayNodeLabel(item.node) }}
                </span>
              </span>
            </button>
          </div>

          <div v-else class="h-28 flex items-center justify-center color-muted text-3.5 italic">
            No data
          </div>
        </div>
      </section>
    </template>

    <p v-else class="m-0 color-muted text-3 leading-5">
      Select a node to inspect its dependencies and subscribers.
    </p>
  </aside>
</template>

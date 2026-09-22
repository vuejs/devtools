<script setup lang="ts">
import type { ReactivityGraphSnapshot } from '@vue/devtools-kit'
import DevtoolsIcon from '../common/DevtoolsIcon.vue'
import {
  emptyRelationshipPath,
  type RelationshipPathResult,
} from '../../utils/reactivity-graph-paths'
import {
  buildForceGraph,
  buildGroupCenters,
  displayNodeLabel,
  shortenLabel,
  type ForceNode,
  type ForceLink,
  type GraphGroup,
} from '../../utils/reactivity-graph-layout'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force'
import { select } from 'd3-selection'
import { type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom'

import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch, toRef } from 'vue'
import { TYPE_LEGEND_TYPES, typeColor, nodeTypeLabel } from '../../utils/reactivity-graph-display'
const props = defineProps<{
  graph: ReactivityGraphSnapshot
  path?: RelationshipPathResult
  pathSelectorOpen: boolean
}>()
const selectedNodeId = defineModel<string>('selectedNodeId')
const dependencyDepth = defineModel<number>('dependencyDepth', { required: true })
const emit = defineEmits<{ select: [nodeId: string] }>()
const filteredGraph = toRef(props, 'graph')
const pathSelectorOpen = toRef(props, 'pathSelectorOpen')
const pathModeActive = computed(() => !!props.path)
const selectedRelationshipPath = computed(() => props.path ?? emptyRelationshipPath())
function selectGraphNode(nodeId: string) {
  emit('select', nodeId)
}
interface GroupRegion extends GraphGroup {
  color: string
  radius: number
  x: number
  y: number
}

interface TraversalResult {
  nodeIds: Set<string>
  relationshipIds: Set<string>
}

interface RelationshipContext {
  dependencyNodeIds: Set<string>
  nodeIds: Set<string>
  relationshipIds: Set<string>
  subscriberNodeIds: Set<string>
}

const MIN_WIDTH = 680

const MIN_HEIGHT = 460

const LABEL_HEIGHT = 34

const GROUP_COLORS = [
  '#13966f',
  '#3b82d6',
  '#c58119',
  '#d84f45',
  '#0891b2',
  '#db2777',
  '#7c3aed',
  '#64748b',
]

const DEPTH_MIN = 1

const DEPTH_MAX = 6

const container = ref<HTMLDivElement>()

const svg = ref<SVGSVGElement>()

const width = ref(960)

const height = ref(640)

const zoomState = ref({ x: 0, y: 0, k: 1 })

const tick = ref(0)

const forceNodes = shallowRef<ForceNode[]>([])

const forceLinks = shallowRef<ForceLink[]>([])
const nodeById = computed(() => new Map(forceNodes.value.map((node) => [node.id, node])))

const graphGroups = shallowRef<GraphGroup[]>([])

let resizeObserver: ResizeObserver | undefined

let simulation: Simulation<ForceNode, ForceLink> | undefined

let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | undefined

let draggedNodeId: string | undefined

const graphSignature = computed(() =>
  [
    filteredGraph.value.nodes.map((node) => `${node.id}:${node.type}:${node.label}`).join('|'),
    filteredGraph.value.relationships
      .map((relationship) => `${relationship.id}:${relationship.from}:${relationship.to}`)
      .join('|'),
  ].join('::'),
)

const renderGraph = computed(() => ({
  links: forceLinks.value,
  nodes: forceNodes.value,
  version: tick.value,
}))

const highlightedPathRelationships = computed(() => {
  if (!pathModeActive.value) return []
  const relationshipIds = selectedRelationshipPath.value.relationshipIds
  return renderGraph.value.links.filter((relationship) => relationshipIds.has(relationship.id))
})

const groupRegions = computed<GroupRegion[]>(() => {
  const centers = buildGroupCenters(graphGroups.value, width.value, height.value)
  return graphGroups.value.map((group) => {
    const center = centers.get(group.id) ?? { x: width.value / 2, y: height.value / 2 }
    return {
      ...group,
      color: groupColor(group.id),
      radius: Math.max(86, Math.min(210, 56 + Math.sqrt(group.nodeCount) * 34)),
      x: center.x,
      y: center.y,
    }
  })
})

const graphTransform = computed(
  () => `translate(${zoomState.value.x} ${zoomState.value.y}) scale(${zoomState.value.k})`,
)

const zoomLabel = computed(() => `${Math.round(zoomState.value.k * 100)}%`)

const selectedNode = computed(() =>
  forceNodes.value.find((node) => node.id === selectedNodeId.value),
)

const selectedGroup = computed(() =>
  selectedNode.value
    ? graphGroups.value.find((group) => group.id === selectedNode.value?.group)
    : undefined,
)

const relationshipContext = computed<RelationshipContext>(() => {
  if (!selectedNodeId.value) return emptyRelationshipContext()

  const dependencies = collectRelatedNodes(
    selectedNodeId.value,
    'dependencies',
    dependencyDepth.value,
  )
  const subscribers = collectRelatedNodes(
    selectedNodeId.value,
    'subscribers',
    dependencyDepth.value,
  )
  const nodeIds = new Set([selectedNodeId.value, ...dependencies.nodeIds, ...subscribers.nodeIds])

  return {
    dependencyNodeIds: dependencies.nodeIds,
    nodeIds,
    relationshipIds: new Set([...dependencies.relationshipIds, ...subscribers.relationshipIds]),
    subscriberNodeIds: subscribers.nodeIds,
  }
})

const highlightedRelationshipIds = computed(() => {
  if (pathModeActive.value) return selectedRelationshipPath.value.relationshipIds
  return relationshipContext.value.relationshipIds
})

const connectedNodeIds = computed(() => {
  if (pathModeActive.value) return selectedRelationshipPath.value.nodeIds
  return relationshipContext.value.nodeIds
})

function emptyRelationshipContext(): RelationshipContext {
  return {
    dependencyNodeIds: new Set(),
    nodeIds: new Set(),
    relationshipIds: new Set(),
    subscriberNodeIds: new Set(),
  }
}

function collectRelatedNodes(
  startId: string,
  direction: 'dependencies' | 'subscribers',
  maxDepth: number,
): TraversalResult {
  const nodeIds = new Set<string>()
  const relationshipIds = new Set<string>()
  const visitedNodeIds = new Set([startId])
  let frontier = new Set([startId])

  for (let depth = 0; depth < maxDepth && frontier.size; depth += 1) {
    const nextFrontier = new Set<string>()

    for (const relationship of forceLinks.value) {
      const sourceId = direction === 'dependencies' ? relationship.from : relationship.to
      const targetId = direction === 'dependencies' ? relationship.to : relationship.from

      if (!frontier.has(targetId)) continue

      relationshipIds.add(relationship.id)
      nodeIds.add(sourceId)

      if (!visitedNodeIds.has(sourceId)) {
        visitedNodeIds.add(sourceId)
        nextFrontier.add(sourceId)
      }
    }

    frontier = nextFrontier
  }

  return { nodeIds, relationshipIds }
}

function setDependencyDepth(depth: number) {
  dependencyDepth.value = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, depth))
}

function adjustDependencyDepth(offset: number) {
  setDependencyDepth(dependencyDepth.value + offset)
}

function restartSimulation() {
  simulation?.stop()

  const forceGraph = buildForceGraph(filteredGraph.value, width.value, height.value)
  forceNodes.value = forceGraph.nodes
  forceLinks.value = forceGraph.links
  graphGroups.value = forceGraph.groups
  tick.value += 1

  if (selectedNodeId.value && !forceGraph.nodes.some((node) => node.id === selectedNodeId.value)) {
    selectedNodeId.value = undefined
  }

  if (!selectedNodeId.value && !pathSelectorOpen.value && !pathModeActive.value) {
    selectedNodeId.value = pickDefaultNode(forceGraph.nodes)?.id
  }

  if (!forceGraph.nodes.length) {
    simulation = undefined
    return
  }

  const centers = buildGroupCenters(forceGraph.groups, width.value, height.value)
  simulation = forceSimulation<ForceNode, ForceLink>(forceGraph.nodes)
    .force(
      'link',
      forceLink<ForceNode, ForceLink>(forceGraph.links)
        .id((node) => node.id)
        .distance((link) => (link.group === selectedGroup.value?.id ? 92 : 112))
        .strength(0.58),
    )
    .force(
      'charge',
      forceManyBody<ForceNode>().strength((node) => -260 - node.radius * 14),
    )
    .force(
      'collide',
      forceCollide<ForceNode>().radius((node) => node.radius + labelCollisionRadius(node)),
    )
    .force(
      'x',
      forceX<ForceNode>((node) => centers.get(node.group)?.x ?? width.value / 2).strength(0.085),
    )
    .force(
      'y',
      forceY<ForceNode>((node) => centers.get(node.group)?.y ?? height.value / 2).strength(0.085),
    )
    .alpha(0.95)
    .alphaDecay(0.022)
    .on('tick', () => {
      tick.value += 1
    })
}

function refreshContextForces() {
  if (!simulation) return

  simulation
    .force(
      'collide',
      forceCollide<ForceNode>().radius((node) => node.radius + labelCollisionRadius(node)),
    )
    .alpha(0.32)
    .restart()
}

function attachZoom() {
  if (!svg.value) return

  zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.32, 2.6])
    .filter((event) => {
      const target = event.target as Element | null
      if (event.type === 'mousedown' && target?.closest('[data-graph-node]')) return false
      return (!event.ctrlKey || event.type === 'wheel') && !event.button
    })
    .on('zoom', (event) => {
      zoomState.value = {
        k: event.transform.k,
        x: event.transform.x,
        y: event.transform.y,
      }
    })

  select(svg.value).call(zoomBehavior)
  void nextTick(fitGraph)
}

function fitGraph() {
  if (!svg.value || !zoomBehavior) return

  const bounds = getGraphBounds()
  if (!bounds) {
    select(svg.value).call(zoomBehavior.transform, zoomIdentity)
    return
  }

  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX)
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min(
    1.45,
    Math.max(0.42, Math.min((width.value - 96) / boundsWidth, (height.value - 96) / boundsHeight)),
  )
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const transform = zoomIdentity
    .translate(width.value / 2, height.value / 2)
    .scale(scale)
    .translate(-centerX, -centerY)

  select(svg.value).call(zoomBehavior.transform, transform)
}

function zoomBy(factor: number) {
  if (!svg.value || !zoomBehavior) return
  select(svg.value).call(zoomBehavior.scaleBy, factor)
}

function getGraphBounds() {
  const nodes = forceNodes.value
  if (!nodes.length) return undefined

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    const x = node.x ?? width.value / 2
    const y = node.y ?? height.value / 2
    minX = Math.min(minX, x - node.radius - 72)
    minY = Math.min(minY, y - node.radius - 32)
    maxX = Math.max(maxX, x + node.radius + 142)
    maxY = Math.max(maxY, y + node.radius + 32)
  }

  return { minX, minY, maxX, maxY }
}

function startNodeDrag(event: PointerEvent, node: ForceNode) {
  event.stopPropagation()
  selectGraphNode(node.id)
  draggedNodeId = node.id
  node.fx = node.x
  node.fy = node.y
  simulation?.alphaTarget(0.28).restart()
  const target = event.currentTarget as Element
  target.setPointerCapture(event.pointerId)
}

function dragNode(event: PointerEvent, node: ForceNode) {
  if (draggedNodeId !== node.id) return

  const point = getGraphPoint(event)
  node.fx = point.x
  node.fy = point.y
  tick.value += 1
}

function endNodeDrag(event: PointerEvent, node: ForceNode) {
  if (draggedNodeId !== node.id) return

  draggedNodeId = undefined
  node.fx = null
  node.fy = null
  simulation?.alphaTarget(0)
  const target = event.currentTarget as Element
  target.releasePointerCapture(event.pointerId)
}

function getGraphPoint(event: PointerEvent) {
  if (!svg.value) return { x: event.offsetX, y: event.offsetY }

  const point = svg.value.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const screenMatrix = svg.value.getScreenCTM()
  const svgPoint = screenMatrix ? point.matrixTransform(screenMatrix.inverse()) : point
  return {
    x: (svgPoint.x - zoomState.value.x) / zoomState.value.k,
    y: (svgPoint.y - zoomState.value.y) / zoomState.value.k,
  }
}

function linkSource(link: ForceLink) {
  return resolveLinkNode(link.source)
}

function linkTarget(link: ForceLink) {
  return resolveLinkNode(link.target)
}

function resolveLinkNode(endpoint: string | number | ForceNode | undefined) {
  if (typeof endpoint === 'object') return endpoint
  if (endpoint == null) return undefined
  return nodeById.value.get(String(endpoint))
}

function linkX1(link: ForceLink) {
  return linkEndpoint(link, 'source').x
}

function linkY1(link: ForceLink) {
  return linkEndpoint(link, 'source').y
}

function linkX2(link: ForceLink) {
  return linkEndpoint(link, 'target').x
}

function linkY2(link: ForceLink) {
  return linkEndpoint(link, 'target').y
}

function linkEndpoint(link: ForceLink, endpoint: 'source' | 'target') {
  const source = linkSource(link)
  const target = linkTarget(link)
  if (!source || !target) return { x: width.value / 2, y: height.value / 2 }

  const sourceX = source.x ?? width.value / 2
  const sourceY = source.y ?? height.value / 2
  const targetX = target.x ?? width.value / 2
  const targetY = target.y ?? height.value / 2
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY
  const distance = Math.hypot(deltaX, deltaY) || 1
  const unitX = deltaX / distance
  const unitY = deltaY / distance

  if (endpoint === 'source') {
    const padding = source.radius + 2
    return {
      x: sourceX + unitX * padding,
      y: sourceY + unitY * padding,
    }
  }

  const padding = target.radius + 6
  return {
    x: targetX - unitX * padding,
    y: targetY - unitY * padding,
  }
}

function isRelationshipHighlighted(relationship: ForceLink) {
  if (pathModeActive.value) return highlightedRelationshipIds.value.has(relationship.id)
  return !selectedNodeId.value || highlightedRelationshipIds.value.has(relationship.id)
}

function isNodeHighlighted(node: ForceNode) {
  if (pathModeActive.value) return connectedNodeIds.value.has(node.id)
  return !selectedNodeId.value || connectedNodeIds.value.has(node.id)
}

function isPathNode(node: ForceNode) {
  return pathModeActive.value && connectedNodeIds.value.has(node.id)
}

function shouldShowNodeLabel(node: ForceNode) {
  if (pathModeActive.value) return connectedNodeIds.value.has(node.id)
  if (!selectedNodeId.value) return defaultNodeScore(node) >= 4
  return node.id === selectedNodeId.value || connectedNodeIds.value.has(node.id)
}

function labelCollisionRadius(node: ForceNode) {
  return shouldShowNodeLabel(node) ? 44 + node.labelWidth * 0.16 : 20
}

function labelSide(node: ForceNode) {
  const centerX = width.value / 2
  return (node.x ?? centerX) > centerX ? 'left' : 'right'
}

function labelX(node: ForceNode) {
  const gap = node.radius + 8
  return labelSide(node) === 'left' ? -node.labelWidth - gap : gap
}

function labelAnchorX(node: ForceNode) {
  return labelSide(node) === 'left' ? labelX(node) + node.labelWidth - 10 : labelX(node) + 10
}

function labelTextAnchor(node: ForceNode) {
  return labelSide(node) === 'left' ? 'end' : 'start'
}

function pickDefaultNode(nodes: ForceNode[]) {
  return [...nodes].sort((a, b) => defaultNodeScore(b) - defaultNodeScore(a)).at(0)
}

function defaultNodeScore(node: ForceNode) {
  const bridgeScore = Math.min(node.incoming, node.outgoing) * 2
  const typeScore =
    node.type === 'computed' ? 2 : node.type === 'watch' || node.type === 'effect' ? 1 : 0
  return node.incoming + node.outgoing + bridgeScore + typeScore
}

function groupColor(group: number) {
  return GROUP_COLORS[group % GROUP_COLORS.length]
}

function edgeColor(relationship: ForceLink) {
  if (pathModeActive.value) {
    return isRelationshipHighlighted(relationship) ? groupColor(relationship.group) : '#888888'
  }
  if (!selectedNodeId.value) return groupColor(relationship.group)
  return isRelationshipHighlighted(relationship) ? groupColor(relationship.group) : '#888888'
}

function edgeOpacity(relationship: ForceLink) {
  if (pathModeActive.value) return isRelationshipHighlighted(relationship) ? 0.9 : 0.08
  if (!selectedNodeId.value) return 0.42
  return isRelationshipHighlighted(relationship) ? 0.72 : 0.12
}

function edgeWidth(relationship: ForceLink) {
  if (pathModeActive.value) return isRelationshipHighlighted(relationship) ? 2.8 : 1
  return isRelationshipHighlighted(relationship) ? 1.8 : 1.1
}

function edgeMarkerUrl(relationship: ForceLink) {
  const markerId =
    (selectedNodeId.value || pathModeActive.value) && !isRelationshipHighlighted(relationship)
      ? 'reactivity-arrow-muted'
      : `reactivity-arrow-${relationship.group % GROUP_COLORS.length}`
  return `url(#${markerId})`
}

function nodeOpacity(node: ForceNode) {
  if (pathModeActive.value) return isNodeHighlighted(node) ? 1 : 0.18
  if (!selectedNodeId.value) return 1
  return isNodeHighlighted(node) ? 1 : 0.28
}

function nodeStrokeColor(node: ForceNode) {
  if (node.id === selectedNodeId.value || isPathNode(node)) {
    return '#111827'
  }
  return '#ffffff'
}

function nodeStrokeOpacity(node: ForceNode) {
  if (node.id === selectedNodeId.value || isPathNode(node)) {
    return 0.72
  }
  return 0.92
}

function nodeStrokeWidth(node: ForceNode) {
  if (node.id === selectedNodeId.value || isPathNode(node)) {
    return 3
  }
  return 1.5
}
onMounted(() => {
  if (container.value) {
    resizeObserver = new ResizeObserver(([entry]) => {
      width.value = Math.max(MIN_WIDTH, entry.contentRect.width)
      height.value = Math.max(MIN_HEIGHT, entry.contentRect.height)
    })
    resizeObserver.observe(container.value)
  }
  attachZoom()
})

watch(
  [graphSignature, width, height],
  () => {
    restartSimulation()
    void nextTick(fitGraph)
  },
  { immediate: true },
)

watch([selectedNodeId, dependencyDepth, () => props.path], refreshContextForces)

onUnmounted(() => {
  resizeObserver?.disconnect()
  simulation?.stop()
})
</script>

<template>
  <div
    ref="container"
    class="relative h-full min-w-0 overflow-hidden bg-subtle bg-dots select-none"
  >
    <svg
      ref="svg"
      class="h-full w-full touch-none"
      role="img"
      aria-label="Vue reactivity dependency graph"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
    >
      <defs>
        <marker
          id="reactivity-arrow-muted"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          markerWidth="10"
          orient="auto"
          refX="8"
          refY="0"
          viewBox="0 -5 10 10"
        >
          <path d="M 0 -4 L 9 0 L 0 4 z" fill="#888888" opacity="0.42" />
        </marker>
        <marker
          v-for="(_, index) in GROUP_COLORS"
          :id="`reactivity-arrow-${index}`"
          :key="`arrow-${index}`"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          markerWidth="10"
          orient="auto"
          refX="8"
          refY="0"
          viewBox="0 -5 10 10"
        >
          <path d="M 0 -4 L 9 0 L 0 4 z" :fill="groupColor(index)" opacity="0.82" />
        </marker>
      </defs>

      <g :transform="graphTransform">
        <circle
          v-for="group in groupRegions"
          :key="`group-${group.id}`"
          :cx="group.x"
          :cy="group.y"
          :fill="group.color"
          :fill-opacity="selectedGroup && selectedGroup.id !== group.id ? 0.025 : 0.07"
          :r="group.radius"
          :stroke="group.color"
          :stroke-opacity="selectedGroup && selectedGroup.id !== group.id ? 0.08 : 0.18"
          stroke-dasharray="5 6"
          stroke-width="1"
        />

        <line
          v-for="relationship in renderGraph.links"
          :key="relationship.id"
          :stroke="edgeColor(relationship)"
          stroke-linecap="round"
          :stroke-opacity="edgeOpacity(relationship)"
          :stroke-width="edgeWidth(relationship)"
          :marker-end="edgeMarkerUrl(relationship)"
          :x1="linkX1(relationship)"
          :x2="linkX2(relationship)"
          :y1="linkY1(relationship)"
          :y2="linkY2(relationship)"
        />

        <line
          v-for="relationship in highlightedPathRelationships"
          :key="`path-${relationship.id}`"
          class="pointer-events-none"
          :stroke="edgeColor(relationship)"
          stroke-linecap="round"
          stroke-opacity="0.96"
          stroke-width="3.4"
          :marker-end="edgeMarkerUrl(relationship)"
          :x1="linkX1(relationship)"
          :x2="linkX2(relationship)"
          :y1="linkY1(relationship)"
          :y2="linkY2(relationship)"
        />

        <g
          v-for="node in renderGraph.nodes"
          :key="node.id"
          data-graph-node
          class="cursor-grab outline-none active:cursor-grabbing"
          :opacity="nodeOpacity(node)"
          role="button"
          tabindex="0"
          :aria-label="`Select ${displayNodeLabel(node)} graph node`"
          :transform="`translate(${node.x ?? width / 2} ${node.y ?? height / 2})`"
          @click.stop="selectGraphNode(node.id)"
          @keydown.enter.prevent="selectGraphNode(node.id)"
          @pointercancel="endNodeDrag($event, node)"
          @pointerdown="startNodeDrag($event, node)"
          @pointermove="dragNode($event, node)"
          @pointerup="endNodeDrag($event, node)"
        >
          <circle
            :fill="typeColor(node.type)"
            :r="node.radius"
            :stroke="nodeStrokeColor(node)"
            :stroke-opacity="nodeStrokeOpacity(node)"
            :stroke-width="nodeStrokeWidth(node)"
            class="dark:stroke-#f8fafc"
          />
          <g v-if="shouldShowNodeLabel(node)" class="pointer-events-none">
            <rect
              :fill="node.id === selectedNodeId ? '#f8fafc' : '#111827'"
              :fill-opacity="node.id === selectedNodeId ? 0.96 : 0.9"
              :height="LABEL_HEIGHT"
              rx="5"
              :stroke="groupColor(node.group)"
              :stroke-opacity="node.id === selectedNodeId ? 0.82 : 0.34"
              stroke-width="1"
              :width="node.labelWidth"
              :x="labelX(node)"
              y="-17"
            />
            <text
              class="font-state-field text-3 font-700"
              dominant-baseline="middle"
              :fill="node.id === selectedNodeId ? '#111827' : '#f8fafc'"
              :text-anchor="labelTextAnchor(node)"
              :x="labelAnchorX(node)"
              y="-5"
            >
              {{ shortenLabel(displayNodeLabel(node)) }}
            </text>
            <text
              class="text-2.25 font-800"
              dominant-baseline="middle"
              :fill="node.id === selectedNodeId ? '#475569' : '#94a3b8'"
              :text-anchor="labelTextAnchor(node)"
              :x="labelAnchorX(node)"
              y="9"
            >
              {{ nodeTypeLabel(node.type) }}
            </text>
          </g>
          <title>{{ displayNodeLabel(node) }} - {{ nodeTypeLabel(node.type) }}</title>
        </g>
      </g>
    </svg>

    <div
      class="absolute bottom-3 left-3 z-30 grid grid-cols-2 gap-x-3 gap-y-1.5 border border-base bg-glass px-3 py-2 shadow"
    >
      <div
        v-for="type in TYPE_LEGEND_TYPES"
        :key="type"
        class="font-state-field min-w-23 flex items-center gap-1.5 color-base text-3.5"
      >
        <span class="h-2.3 w-2.3 shrink-0 rounded-full" :style="{ background: typeColor(type) }" />
        <span class="truncate">{{ nodeTypeLabel(type) }}</span>
      </div>
    </div>

    <div class="absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      <div
        v-tooltip.top="'Relationship depth'"
        class="w-28 flex items-center justify-between gap-0.5 rounded-full border border-base bg-glass p-1 shadow"
      >
        <button
          v-tooltip.top="'Decrease relationship depth'"
          class="h-8 w-8 rounded-full border-0 bg-transparent color-base flex items-center justify-center hover:bg-active"
          :class="dependencyDepth <= DEPTH_MIN ? 'op35' : ''"
          type="button"
          aria-label="Decrease relationship depth"
          :disabled="dependencyDepth <= DEPTH_MIN"
          @click.stop="adjustDependencyDepth(-1)"
        >
          <DevtoolsIcon icon="i-carbon-subtract" class="text-4" />
        </button>
        <span
          class="font-state-field h-8 w-8 rounded-full bg-active color-muted flex items-center justify-center text-3.5"
        >
          {{ dependencyDepth }}
        </span>
        <button
          v-tooltip.top="'Increase relationship depth'"
          class="h-8 w-8 rounded-full border-0 bg-transparent color-base flex items-center justify-center hover:bg-active"
          :class="dependencyDepth >= DEPTH_MAX ? 'op35' : ''"
          type="button"
          aria-label="Increase relationship depth"
          :disabled="dependencyDepth >= DEPTH_MAX"
          @click.stop="adjustDependencyDepth(1)"
        >
          <DevtoolsIcon icon="i-carbon-add" class="text-4" />
        </button>
      </div>

      <div
        class="w-28 flex items-center justify-between gap-0.5 rounded-full border border-base bg-glass p-1 shadow"
      >
        <button
          v-tooltip.top="'Zoom out'"
          class="h-8 w-8 rounded-full border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Zoom out"
          @click.stop="zoomBy(0.82)"
        >
          <DevtoolsIcon icon="i-carbon-zoom-out" class="text-4" />
        </button>
        <button
          v-tooltip.top="'Fit graph'"
          class="h-8 min-w-10 rounded-full border-0 bg-transparent px-1.5 color-muted text-3 hover:bg-active hover:color-base"
          type="button"
          aria-label="Fit graph"
          @click.stop="fitGraph"
        >
          {{ zoomLabel }}
        </button>
        <button
          v-tooltip.top="'Zoom in'"
          class="h-8 w-8 rounded-full border-0 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Zoom in"
          @click.stop="zoomBy(1.18)"
        >
          <DevtoolsIcon icon="i-carbon-zoom-in" class="text-4" />
        </button>
      </div>
    </div>
  </div>
</template>

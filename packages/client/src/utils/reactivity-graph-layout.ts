import type {
  ReactivityGraphNode,
  ReactivityGraphNodeType,
  ReactivityGraphSnapshot,
  ReactivityRelationship,
} from '@vue/devtools-kit'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'

export interface ForceNode
  extends Pick<ReactivityGraphNode, 'id' | 'type' | 'label'>, SimulationNodeDatum {
  group: number
  incoming: number
  labelWidth: number
  outgoing: number
  radius: number
}

export interface ForceLink extends SimulationLinkDatum<ForceNode>, ReactivityRelationship {
  group: number
  source: string | ForceNode
  target: string | ForceNode
  value: number
}

export interface GraphGroup {
  id: number
  nodeCount: number
  relationshipCount: number
}

const NODE_MIN_RADIUS = 8
const NODE_MAX_RADIUS = 16
const LABEL_CHAR_WIDTH = 7.2
const LABEL_MAX_WIDTH = 172
const LABEL_MIN_WIDTH = 76

export function buildForceGraph(
  graph: ReactivityGraphSnapshot,
  viewportWidth: number,
  viewportHeight: number,
): { groups: GraphGroup[]; links: ForceLink[]; nodes: ForceNode[] } {
  const ids = new Set(graph.nodes.map((node) => node.id))
  const parent = new Map(graph.nodes.map((node) => [node.id, node.id]))
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(graph.nodes.map((node) => [node.id, 0]))

  function find(id: string): string {
    const current = parent.get(id) ?? id
    if (current === id) return current
    const root = find(current)
    parent.set(id, root)
    return root
  }

  function union(a: string, b: string) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  for (const relationship of graph.relationships) {
    if (!ids.has(relationship.from) || !ids.has(relationship.to)) continue
    union(relationship.from, relationship.to)
    outgoing.set(relationship.from, (outgoing.get(relationship.from) ?? 0) + 1)
    incoming.set(relationship.to, (incoming.get(relationship.to) ?? 0) + 1)
  }

  const groupByRoot = new Map<string, number>()
  const groups: GraphGroup[] = []
  for (const node of graph.nodes) {
    const root = find(node.id)
    if (groupByRoot.has(root)) continue
    const id = groupByRoot.size
    groupByRoot.set(root, id)
    groups.push({ id, nodeCount: 0, relationshipCount: 0 })
  }

  const centers = buildGroupCenters(groups, viewportWidth, viewportHeight)
  const nodes = graph.nodes.map((node) => {
    const group = groupByRoot.get(find(node.id)) ?? 0
    const degree = (incoming.get(node.id) ?? 0) + (outgoing.get(node.id) ?? 0)
    const radius = Math.min(NODE_MAX_RADIUS, NODE_MIN_RADIUS + Math.sqrt(degree + 1) * 3)
    const center = centers.get(group) ?? { x: viewportWidth / 2, y: viewportHeight / 2 }
    const angle = (hashString(node.id) % 360) * (Math.PI / 180)
    const distance = 18 + (hashString(`${node.id}:distance`) % 54)
    const summary = groups[group]
    if (summary) summary.nodeCount += 1

    return {
      id: node.id,
      type: node.type,
      label: node.label,
      group,
      incoming: incoming.get(node.id) ?? 0,
      labelWidth: getLabelWidth(displayNodeLabel(node)),
      outgoing: outgoing.get(node.id) ?? 0,
      radius,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
    }
  })

  const links = graph.relationships
    .map((relationship): ForceLink | undefined => {
      if (!ids.has(relationship.from) || !ids.has(relationship.to)) return undefined

      const group = groupByRoot.get(find(relationship.from)) ?? 0
      const summary = groups[group]
      if (summary) summary.relationshipCount += 1

      return {
        ...relationship,
        group,
        source: relationship.from,
        target: relationship.to,
        value: 1,
      } satisfies ForceLink
    })
    .filter((relationship): relationship is ForceLink => relationship !== undefined)

  return { groups, links, nodes }
}

export function buildGroupCenters(
  groups: GraphGroup[],
  viewportWidth: number,
  viewportHeight: number,
): Map<number, { x: number; y: number }> {
  const centers = new Map<number, { x: number; y: number }>()
  if (!groups.length) return centers

  const columns = Math.ceil(Math.sqrt(groups.length))
  const rows = Math.ceil(groups.length / columns)
  const insetX = Math.min(170, Math.max(78, viewportWidth * 0.12))
  const insetY = Math.min(128, Math.max(76, viewportHeight * 0.16))
  const usableWidth = Math.max(1, viewportWidth - insetX * 2)
  const usableHeight = Math.max(1, viewportHeight - insetY * 2)

  groups.forEach((group, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    centers.set(group.id, {
      x: insetX + (usableWidth * (column + 0.5)) / columns,
      y: insetY + (usableHeight * (row + 0.5)) / rows,
    })
  })

  return centers
}

export function shortenLabel(label: string) {
  if (label.length <= 22) return label
  return `${label.slice(0, 12)}...${label.slice(-7)}`
}

function getLabelWidth(label: string) {
  return Math.min(
    LABEL_MAX_WIDTH,
    Math.max(LABEL_MIN_WIDTH, shortenLabel(label).length * LABEL_CHAR_WIDTH + 22),
  )
}

export function displayNodeLabel(node: Pick<ReactivityGraphNode, 'label' | 'type'>) {
  const genericLabel = genericNodeLabel(node.type)
  const legacyFallbacks = new Set([
    node.type,
    genericLabel,
    'component render',
    'reactive.property',
    'render/effect',
    'watch callback',
  ])

  if (!legacyFallbacks.has(node.label)) {
    return node.label
  }

  return genericLabel
}

function genericNodeLabel(type: ReactivityGraphNodeType) {
  switch (type) {
    case 'ref':
      return 'Anonymous Ref'
    case 'computed':
      return 'Anonymous Computed'
    case 'reactive':
      return 'Reactive Property'
    case 'watch':
      return 'Anonymous Watch'
    case 'render':
      return 'Anonymous Render'
    case 'effect':
      return 'Anonymous Effect'
    default:
      return 'Unknown'
  }
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index)
  }
  return Math.abs(hash)
}

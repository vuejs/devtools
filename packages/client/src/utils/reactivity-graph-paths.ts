import type { ReactivityGraphNode, ReactivityRelationship } from '@vue/devtools-kit'

export interface RelationshipPathResult {
  nodeIds: Set<string>
  orderedNodeIds: string[]
  orderedRelationshipIds: string[]
  relationshipIds: Set<string>
}

export function emptyRelationshipPath(): RelationshipPathResult {
  return {
    nodeIds: new Set(),
    orderedNodeIds: [],
    orderedRelationshipIds: [],
    relationshipIds: new Set(),
  }
}

export function indexGraphRelationships(relationships: ReactivityRelationship[]) {
  const bySource = new Map<string, ReactivityRelationship[]>()
  for (const relationship of relationships) {
    const edges = bySource.get(relationship.from) ?? []
    edges.push(relationship)
    bySource.set(relationship.from, edges)
  }
  return bySource
}

export function getRootPathNodeIds(
  nodes: ReactivityGraphNode[],
  relationships: ReactivityRelationship[],
) {
  const subscribed = new Set(relationships.map((relationship) => relationship.to))
  return new Set(nodes.filter((node) => !subscribed.has(node.id)).map((node) => node.id))
}

export function getReachablePathNodeIds(
  startId: string,
  bySource: Map<string, ReactivityRelationship[]>,
) {
  const visited = new Set([startId])
  const queue = [startId]
  for (const nodeId of queue) {
    for (const edge of bySource.get(nodeId) ?? []) {
      if (visited.has(edge.to)) continue
      visited.add(edge.to)
      queue.push(edge.to)
    }
  }
  visited.delete(startId)
  return visited
}

export function buildRelationshipPath(
  startId: string,
  endId: string,
  bySource: Map<string, ReactivityRelationship[]>,
): RelationshipPathResult {
  if (!startId || !endId) return emptyRelationshipPath()
  const previous = new Map<string, ReactivityRelationship>()
  const visited = new Set([startId])
  const queue = [startId]
  for (const nodeId of queue) {
    if (visited.has(endId)) break
    for (const edge of bySource.get(nodeId) ?? []) {
      if (visited.has(edge.to)) continue
      visited.add(edge.to)
      previous.set(edge.to, edge)
      queue.push(edge.to)
      if (edge.to === endId) break
    }
  }
  const orderedNodeIds = [endId]
  const orderedRelationshipIds: string[] = []
  if (visited.has(endId)) {
    let nodeId = endId
    while (nodeId !== startId) {
      const edge = previous.get(nodeId)!
      orderedRelationshipIds.push(edge.id)
      orderedNodeIds.push(edge.from)
      nodeId = edge.from
    }
  } else {
    orderedNodeIds.push(startId)
  }
  orderedNodeIds.reverse()
  orderedRelationshipIds.reverse()
  return {
    nodeIds: new Set(orderedNodeIds),
    orderedNodeIds,
    relationshipIds: new Set(orderedRelationshipIds),
    orderedRelationshipIds,
  }
}

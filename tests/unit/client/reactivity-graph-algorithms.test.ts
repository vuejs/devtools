import type { ReactivityGraphSnapshot } from '../../../packages/kit/src/protocol'
import { describe, expect, it } from 'vitest'
import { buildForceGraph } from '../../../packages/client/src/utils/reactivity-graph-layout'
import {
  buildRelationshipPath,
  getReachablePathNodeIds,
  indexGraphRelationships,
} from '../../../packages/client/src/utils/reactivity-graph-paths'

const edges = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'a'],
  ['a', 'c'],
  ['c', 'd'],
].map(([from, to], index) => ({ id: String(index), from: from!, to: to! }))

describe('reactivity graph algorithms', () => {
  it('finds shortest directed paths through cycles and handles missing or identical endpoints', () => {
    const index = indexGraphRelationships(edges)
    expect(buildRelationshipPath('a', 'd', index).orderedNodeIds).toEqual(['a', 'c', 'd'])
    expect(buildRelationshipPath('a', 'd', index).orderedRelationshipIds).toEqual(['3', '4'])
    expect(getReachablePathNodeIds('a', index)).toEqual(new Set(['b', 'c', 'd']))
    expect(buildRelationshipPath('a', 'a', index).orderedNodeIds).toEqual(['a'])
    expect(buildRelationshipPath('a', 'missing', index).orderedRelationshipIds).toEqual([])
    expect(buildRelationshipPath('', 'a', index).orderedNodeIds).toEqual([])
  })

  it('builds long paths without copying every intermediate path', () => {
    const index = indexGraphRelationships(
      Array.from({ length: 10_000 }, (_, i) => ({
        id: String(i),
        from: String(i),
        to: String(i + 1),
      })),
    )
    const result = buildRelationshipPath('0', '10000', index)
    expect(result.orderedNodeIds).toHaveLength(10_001)
    expect(result.orderedNodeIds[0]).toBe('0')
    expect(result.orderedNodeIds.at(-1)).toBe('10000')
  })

  it('keeps layout mutations separate from snapshots and ignores dangling edges', () => {
    const graph: ReactivityGraphSnapshot = {
      nodes: ['a', 'b', 'c'].map((id) => ({ id, label: id, type: 'ref', data: { value: 1 } })),
      relationships: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'missing', from: 'a', to: 'missing' },
      ],
    }
    const result = buildForceGraph(graph, 960, 640)
    expect(result.groups.map((group) => group.nodeCount)).toEqual([2, 1])
    expect(result.links.map((link) => link.id)).toEqual(['ab'])
    result.nodes[0]!.x = 0
    result.links[0]!.source = result.nodes[0]!
    expect(graph.nodes[0]).toEqual({ id: 'a', label: 'a', type: 'ref', data: { value: 1 } })
    expect(graph.relationships[0]?.from).toBe('a')
  })
})

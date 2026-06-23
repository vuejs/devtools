import type { ModuleInfo } from '@vue/devtools-core'
import type { Edge } from 'vis-network'
import { beforeEach, describe, expect, it } from 'vitest'
import { dfs } from '../graph'

// Mock test data
interface GraphNodesTotalData {
  mod: ModuleInfo
  info: {
    displayName: string
    displayPath: string
  }
  node: any
  edges: Edge[]
}

function createMockModule(id: string, displayName: string, deps: string[]): GraphNodesTotalData {
  return {
    mod: {
      id,
      deps,
      virtual: false,
    } as ModuleInfo,
    info: {
      displayName,
      displayPath: id,
    },
    node: {
      id,
      label: displayName,
    },
    edges: deps.map(dep => ({
      from: id,
      to: dep,
      arrows: { to: { enabled: true } },
    })),
  }
}

describe('dfs - graph pathfinding', () => {
  let modulesMap: Map<string, GraphNodesTotalData>

  beforeEach(() => {
    // Build dependency graph:
    // main.ts → App.vue → Header.vue → utils.ts
    //       └→ router.ts → routes.ts → utils.ts
    modulesMap = new Map()

    modulesMap.set('/src/main.ts', createMockModule(
      '/src/main.ts',
      'main.ts',
      ['/src/App.vue', '/src/router.ts'],
    ))

    modulesMap.set('/src/App.vue', createMockModule(
      '/src/App.vue',
      'App.vue',
      ['/src/components/Header.vue'],
    ))

    modulesMap.set('/src/components/Header.vue', createMockModule(
      '/src/components/Header.vue',
      'Header.vue',
      ['/src/utils/utils.ts'],
    ))

    modulesMap.set('/src/router.ts', createMockModule(
      '/src/router.ts',
      'router.ts',
      ['/src/routes.ts'],
    ))

    modulesMap.set('/src/routes.ts', createMockModule(
      '/src/routes.ts',
      'routes.ts',
      ['/src/utils/utils.ts'],
    ))

    modulesMap.set('/src/utils/utils.ts', createMockModule(
      '/src/utils/utils.ts',
      'utils.ts',
      [],
    ))
  })

  it('should find all nodes and edges in a single path', () => {
    const startNode = modulesMap.get('/src/main.ts')!
    const targetIds = new Set(['/src/components/Header.vue'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(true)

    const [nodes, edges] = result
    const nodeIds = Array.from(nodes).map(n => n.mod.id).sort()

    // Should contain path: main.ts → App.vue → Header.vue
    expect(nodeIds).toEqual([
      '/src/App.vue',
      '/src/components/Header.vue',
      '/src/main.ts',
    ])

    // Should contain 2 edges
    const edgeDescriptions = Array.from(edges).map(e => `${e.from}→${e.to}`).sort()
    expect(edgeDescriptions).toEqual([
      '/src/App.vue→/src/components/Header.vue',
      '/src/main.ts→/src/App.vue',
    ])
  })

  it('should find all nodes and edges across multiple paths without duplicates', () => {
    const startNode = modulesMap.get('/src/main.ts')!
    const targetIds = new Set(['/src/utils/utils.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(true)

    const [nodes, edges] = result
    const nodeIds = Array.from(nodes).map(n => n.mod.id).sort()

    // Should contain nodes from both paths:
    // Path 1: main.ts → App.vue → Header.vue → utils.ts
    // Path 2: main.ts → router.ts → routes.ts → utils.ts
    expect(nodeIds).toEqual([
      '/src/App.vue',
      '/src/components/Header.vue',
      '/src/main.ts',
      '/src/router.ts',
      '/src/routes.ts',
      '/src/utils/utils.ts',
    ])

    // Should contain edges from both paths
    const edgeDescriptions = Array.from(edges).map(e => `${e.from}→${e.to}`).sort()
    expect(edgeDescriptions).toEqual([
      '/src/App.vue→/src/components/Header.vue',
      '/src/components/Header.vue→/src/utils/utils.ts',
      '/src/main.ts→/src/App.vue',
      '/src/main.ts→/src/router.ts',
      '/src/router.ts→/src/routes.ts',
      '/src/routes.ts→/src/utils/utils.ts',
    ])
  })

  it('should return empty result when no path exists', () => {
    // utils.ts has no dependencies, cannot reach main.ts
    const startNode = modulesMap.get('/src/utils/utils.ts')!
    const targetIds = new Set(['/src/main.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(false)

    const [nodes, edges] = result
    expect(nodes.size).toBe(0)
    expect(edges.size).toBe(0)
  })

  it('should return only the start node when it is also the target', () => {
    const startNode = modulesMap.get('/src/main.ts')!
    const targetIds = new Set(['/src/main.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(true)

    const [nodes, edges] = result
    expect(nodes.size).toBe(1)
    expect(Array.from(nodes)[0].mod.id).toBe('/src/main.ts')
    expect(edges.size).toBe(0) // No edges, no traversal needed
  })

  it('should handle circular dependencies without infinite loop', () => {
    // Build circular dependency: a → b → c → a
    const circularMap = new Map<string, GraphNodesTotalData>()
    circularMap.set('/src/a.ts', createMockModule('/src/a.ts', 'a.ts', ['/src/b.ts']))
    circularMap.set('/src/b.ts', createMockModule('/src/b.ts', 'b.ts', ['/src/c.ts']))
    circularMap.set('/src/c.ts', createMockModule('/src/c.ts', 'c.ts', ['/src/a.ts']))

    const startNode = circularMap.get('/src/a.ts')!
    const targetIds = new Set(['/src/c.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), circularMap, result)

    expect(found).toBe(true)

    const [nodes, edges] = result
    const nodeIds = Array.from(nodes).map(n => n.mod.id).sort()

    // Should contain a → b → c
    expect(nodeIds).toEqual(['/src/a.ts', '/src/b.ts', '/src/c.ts'])

    // Should not loop infinitely
    const edgeDescriptions = Array.from(edges).map(e => `${e.from}→${e.to}`).sort()
    expect(edgeDescriptions).toEqual([
      '/src/a.ts→/src/b.ts',
      '/src/b.ts→/src/c.ts',
    ])
  })

  it('should support multiple target nodes', () => {
    const startNode = modulesMap.get('/src/main.ts')!
    // Set two targets: Header.vue and routes.ts
    const targetIds = new Set(['/src/components/Header.vue', '/src/routes.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(startNode, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(true)

    const [nodes, edges] = result
    const nodeIds = Array.from(nodes).map(n => n.mod.id).sort()

    // Should contain paths to both targets
    expect(nodeIds).toEqual([
      '/src/App.vue',
      '/src/components/Header.vue',
      '/src/main.ts',
      '/src/router.ts',
      '/src/routes.ts',
    ])

    const edgeDescriptions = Array.from(edges).map(e => `${e.from}→${e.to}`).sort()
    expect(edgeDescriptions).toEqual([
      '/src/App.vue→/src/components/Header.vue',
      '/src/main.ts→/src/App.vue',
      '/src/main.ts→/src/router.ts',
      '/src/router.ts→/src/routes.ts',
    ])
  })

  it('should return false when node is null', () => {
    const targetIds = new Set(['/src/main.ts'])
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    const found = dfs(null as any, targetIds, new Set(), modulesMap, result)

    expect(found).toBe(false)
    expect(result[0].size).toBe(0)
    expect(result[1].size).toBe(0)
  })

  it('should return cached result for already visited nodes', () => {
    const startNode = modulesMap.get('/src/main.ts')!
    const targetIds = new Set(['/src/utils/utils.ts'])
    const existingNodeIds = new Set<GraphNodesTotalData>()
    const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set(), new Set()]

    // First call
    dfs(startNode, targetIds, existingNodeIds, modulesMap, result)

    const firstCallNodeCount = result[0].size
    const firstCallEdgeCount = result[1].size

    // Second call with same start node
    const found = dfs(startNode, targetIds, existingNodeIds, modulesMap, result)

    // Should return cached result without adding duplicates
    expect(found).toBe(true)
    expect(result[0].size).toBe(firstCallNodeCount)
    expect(result[1].size).toBe(firstCallEdgeCount)
  })
})

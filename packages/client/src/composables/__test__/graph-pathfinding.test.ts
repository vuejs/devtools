import type { ModuleInfo } from '@vue/devtools-core'
import { beforeEach, describe, expect, it } from 'vitest'

// Mock test data setup
interface GraphNodesTotalData {
  mod: ModuleInfo
  info: {
    displayName: string
    displayPath: string
  }
  node: any
  edges: any[]
}

// Test module graph structure:
// main.ts -> App.vue -> Header.vue -> utils.ts
//        \-> router.ts -> routes.ts -> utils.ts
const mockModulesMap = new Map<string, GraphNodesTotalData>()

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
    edges: [],
  }
}

describe('graph Pathfinding', () => {
  // Helper function to search modules by text
  function searchModulesByText(searchText: string, modulesMap: Map<string, GraphNodesTotalData>): string[] {
    const results: string[] = []

    modulesMap.forEach((nodeData, moduleId) => {
      const displayName = nodeData.info.displayName.toLowerCase()
      const fullPath = moduleId.toLowerCase()
      const search = searchText.toLowerCase()

      if (displayName.includes(search) || fullPath.includes(search)) {
        results.push(moduleId)
      }
    })

    return results
  }

  beforeEach(() => {
    // Clear and setup mock data
    mockModulesMap.clear()

    // Build a simple dependency graph:
    // main.ts imports App.vue and router.ts
    // App.vue imports Header.vue
    // Header.vue imports utils.ts
    // router.ts imports routes.ts
    // routes.ts imports utils.ts

    mockModulesMap.set('/src/main.ts', createMockModule(
      '/src/main.ts',
      'main.ts',
      ['/src/App.vue', '/src/router.ts'],
    ))

    mockModulesMap.set('/src/App.vue', createMockModule(
      '/src/App.vue',
      'App.vue',
      ['/src/components/Header.vue'],
    ))

    mockModulesMap.set('/src/components/Header.vue', createMockModule(
      '/src/components/Header.vue',
      'Header.vue',
      ['/src/utils/utils.ts'],
    ))

    mockModulesMap.set('/src/router.ts', createMockModule(
      '/src/router.ts',
      'router.ts',
      ['/src/routes.ts'],
    ))

    mockModulesMap.set('/src/routes.ts', createMockModule(
      '/src/routes.ts',
      'routes.ts',
      ['/src/utils/utils.ts'],
    ))

    mockModulesMap.set('/src/utils/utils.ts', createMockModule(
      '/src/utils/utils.ts',
      'utils.ts',
      [],
    ))
  })

  describe('module Search', () => {
    it('should find module by exact display name', () => {
      const results = searchModulesByText('main.ts', mockModulesMap)

      expect(results).toHaveLength(1)
      expect(results[0]).toBe('/src/main.ts')
    })

    it('should find module by partial name', () => {
      const results = searchModulesByText('App', mockModulesMap)

      expect(results).toHaveLength(1)
      expect(results[0]).toBe('/src/App.vue')
    })

    it('should find module by path segment', () => {
      const results = searchModulesByText('components', mockModulesMap)

      expect(results).toHaveLength(1)
      expect(results[0]).toBe('/src/components/Header.vue')
    })

    it('should find multiple modules with common name', () => {
      const results = searchModulesByText('utils', mockModulesMap)

      expect(results).toHaveLength(1)
      expect(results[0]).toBe('/src/utils/utils.ts')
    })

    it('should be case insensitive', () => {
      const results = searchModulesByText('MAIN.TS', mockModulesMap)

      expect(results).toHaveLength(1)
      expect(results[0]).toBe('/src/main.ts')
    })
  })

  // Simple DFS pathfinding implementation for testing
  function findAllPaths(
    startId: string,
    endId: string,
    modulesMap: Map<string, GraphNodesTotalData>,
    maxDepth = 20,
  ) {
    const paths: { path: string[], displayPath: string[] }[] = []
    const visited = new Set<string>()

    function dfs(currentId: string, targetId: string, currentPath: string[], depth: number) {
      if (depth > maxDepth || visited.has(currentId)) {
        return
      }

      currentPath.push(currentId)

      if (currentId === targetId) {
        const displayPath = currentPath.map((id) => {
          const node = modulesMap.get(id)
          return node?.info.displayName ?? id.split('/').at(-1) ?? id
        })
        paths.push({
          path: [...currentPath],
          displayPath,
        })
        currentPath.pop()
        return
      }

      visited.add(currentId)

      const node = modulesMap.get(currentId)
      if (node) {
        for (const dep of node.mod.deps) {
          if (!visited.has(dep)) {
            dfs(dep, targetId, currentPath, depth + 1)
          }
        }
      }

      visited.delete(currentId)
      currentPath.pop()
    }

    dfs(startId, endId, [], 0)
    return paths
  }

  it('should find a single path from main.ts to Header.vue', () => {
    const paths = findAllPaths('/src/main.ts', '/src/components/Header.vue', mockModulesMap)

    expect(paths).toHaveLength(1)
    expect(paths[0].path).toEqual([
      '/src/main.ts',
      '/src/App.vue',
      '/src/components/Header.vue',
    ])
    expect(paths[0].displayPath).toEqual([
      'main.ts',
      'App.vue',
      'Header.vue',
    ])
  })

  it('should find multiple paths from main.ts to utils.ts', () => {
    const paths = findAllPaths('/src/main.ts', '/src/utils/utils.ts', mockModulesMap)

    expect(paths).toHaveLength(2)

    // Path 1: main.ts -> App.vue -> Header.vue -> utils.ts
    expect(paths[0].path).toEqual([
      '/src/main.ts',
      '/src/App.vue',
      '/src/components/Header.vue',
      '/src/utils/utils.ts',
    ])

    // Path 2: main.ts -> router.ts -> routes.ts -> utils.ts
    expect(paths[1].path).toEqual([
      '/src/main.ts',
      '/src/router.ts',
      '/src/routes.ts',
      '/src/utils/utils.ts',
    ])
  })

  it('should return empty array when no path exists', () => {
    const paths = findAllPaths('/src/utils/utils.ts', '/src/main.ts', mockModulesMap)

    expect(paths).toHaveLength(0)
  })

  it('should handle same start and end node', () => {
    const paths = findAllPaths('/src/main.ts', '/src/main.ts', mockModulesMap)

    expect(paths).toHaveLength(1)
    expect(paths[0].path).toEqual(['/src/main.ts'])
  })

  it('should handle non-existent nodes', () => {
    const paths = findAllPaths('/src/nonexistent.ts', '/src/main.ts', mockModulesMap)

    expect(paths).toHaveLength(0)
  })

  it('should prevent infinite loops with max depth', () => {
    // Create a circular dependency
    const circularMap = new Map<string, GraphNodesTotalData>()
    circularMap.set('/src/a.ts', createMockModule('/src/a.ts', 'a.ts', ['/src/b.ts']))
    circularMap.set('/src/b.ts', createMockModule('/src/b.ts', 'b.ts', ['/src/c.ts']))
    circularMap.set('/src/c.ts', createMockModule('/src/c.ts', 'c.ts', ['/src/a.ts']))

    const paths = findAllPaths('/src/a.ts', '/src/nonexistent.ts', circularMap, 3)

    // Should not crash and return empty paths
    expect(paths).toHaveLength(0)
  })

  describe('integration: Search + Pathfinding', () => {
    it('should find paths using partial file names', () => {
      // Search for modules
      const startModules = searchModulesByText('main', mockModulesMap)
      const endModules = searchModulesByText('utils', mockModulesMap)

      // Find paths
      const allPaths: any[] = []
      for (const startId of startModules) {
        for (const endId of endModules) {
          const paths = findAllPaths(startId, endId, mockModulesMap)
          allPaths.push(...paths)
        }
      }

      // Should find 2 paths from main.ts to utils.ts
      expect(allPaths).toHaveLength(2)
    })

    it('should handle case-insensitive search in pathfinding', () => {
      const startModules = searchModulesByText('MAIN.TS', mockModulesMap)
      const endModules = searchModulesByText('HEADER.VUE', mockModulesMap)

      const allPaths: any[] = []
      for (const startId of startModules) {
        for (const endId of endModules) {
          const paths = findAllPaths(startId, endId, mockModulesMap)
          allPaths.push(...paths)
        }
      }

      expect(allPaths).toHaveLength(1)
      expect(allPaths[0].path).toEqual([
        '/src/main.ts',
        '/src/App.vue',
        '/src/components/Header.vue',
      ])
    })

    it('should return empty when search finds no modules', () => {
      const startModules = searchModulesByText('nonexistent', mockModulesMap)
      const endModules = searchModulesByText('utils', mockModulesMap)

      const allPaths: any[] = []
      for (const startId of startModules) {
        for (const endId of endModules) {
          const paths = findAllPaths(startId, endId, mockModulesMap)
          allPaths.push(...paths)
        }
      }

      expect(allPaths).toHaveLength(0)
    })
  })
})

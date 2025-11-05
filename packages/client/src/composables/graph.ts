import type { ModuleInfo } from '@vue/devtools-core'
import type { Edge, Font, Node, Options } from 'vis-network'
import { deepClone } from '@vue/devtools-shared'
import { useDevToolsColorMode } from '@vue/devtools-ui'
import { DataSet } from 'vis-network/standalone'

// #region file types
export const fileTypes = {
  vue: {
    color: '#42b883',
  },
  ts: {
    color: '#3B86CB',
  },
  js: {
    color: '#d6cb2d',
  },
  json: {
    color: '#cf8f30',
  },
  css: {
    color: '#e6659a',
  },
  html: {
    color: '#e34c26',
  },
  jsx: {
    color: '#54B9D1',
  },
  tsx: {
    color: '#4FC7FF',
  },
  other: {
    color: '#B86542',
  },
} satisfies Record<string, { color: string }>

const capitalizeKeys = ['vue', 'other']

export function useFileTypes() {
  const [fileTypeShow, toggleFileType] = useToggle(true)

  return {
    fileTypeData: Object.entries(fileTypes).map(([key, value]) => ({
      key,
      color: value.color,
      capitalize: capitalizeKeys.includes(key),
    })),
    fileTypeShow,
    toggleFileType,
  }
}
// #endregion

// #region graph options
const { isDark } = useDevToolsColorMode()

export const graphOptions = computed<Options>(() => ({
  nodes: {
    shape: 'dot',
    size: 16,
    font: {
      color: isDark.value ? '#fff' : '#000',
      multi: 'html',
    },
  },
  interaction: {
    hover: true,
  },
  physics: {
    maxVelocity: 146,
    solver: 'forceAtlas2Based',
    timestep: 0.35,
    stabilization: {
      enabled: true,
      iterations: 200,
    },
  },
  groups: fileTypes,
}))
// #endregion

// #region graph settings
export interface GraphSettings {
  node_modules: boolean
  virtual: boolean
  lib: boolean
}

export const graphSettings = computed({
  get: () => devtoolsClientState.value.graphSettings,
  set: (value: GraphSettings) => {
    devtoolsClientState.value.graphSettings = value
  },
})

watch(graphSettings, () => {
  updateGraph()
}, { deep: true })
// #endregion

// #region graph search
interface SearcherNode {
  id: string
  fullId: string
  node: Node
  edges: Edge[]
  deps: string[]
  normalizedId: string
  normalizedFullId: string
}

export const graphSearchText = ref('')

// #region pathfinding
export interface PathInfo {
  path: string[] // array of module IDs
  displayPath: string[] // array of display names
}

export const graphPathfindingMode = ref(false)
export const graphPathfindingStart = ref('')
export const graphPathfindingEnd = ref('')
export const graphPathfindingResults = ref<PathInfo[]>([])
export const graphFilterNodeId = ref('')
export const graphDrawerData = ref<DrawerData>()
export const [graphDrawerShow, toggleGraphDrawer] = useToggle(false)

watchDebounced([graphSearchText, graphPathfindingMode, graphPathfindingStart, graphPathfindingEnd], () => {
  updateGraph()
}, {
  debounce: 350,
})
// #endregion

// #region graph data
// NOTE: we can operate DataSet directly to change the graph,
// for performance reasons, just don't parse the whole raw data, instead, we update dataset

interface GraphNodesTotalData {
  mod: ModuleInfo
  info: {
    displayName: string
    displayPath: string
  }
  node: Node
  edges: Edge[]
}

export const projectRoot = ref('')
export const graphNodes = new DataSet<Node>([])
export const graphEdges = new DataSet<Edge>([])
const graphNodesTotal = shallowRef<GraphNodesTotalData[]>([])
const graphNodesTotalMap = new Map<string, GraphNodesTotalData>()
const modulesMap = new Map<string, GraphNodesTotalData>()
const moduleReferences = new Map<string, { path: string, displayPath: string, mod: ModuleInfo }[]>()

const uniqueNodes = (nodes: Node[]) => nodes.reduce<Node[]>((prev, node) => {
  if (!prev.some(n => n.id === node.id))
    prev.push(node)
  return prev
}, [])
const uniqueEdges = (edges: Edge[]) => edges.reduce<Edge[]>((prev, edge) => {
  if (!prev.some(e => e.from === edge.from && e.to === edge.to))
    prev.push(edge)
  return prev
}, [])

export function cleanupGraphRelatedStates() {
  graphNodesTotal.value = []
  graphNodesTotalMap.clear()
  graphNodes.clear()
  graphEdges.clear()
  modulesMap.clear()
  moduleReferences.clear()
  graphPathfindingMode.value = false
  graphPathfindingStart.value = ''
  graphPathfindingEnd.value = ''
  graphPathfindingResults.value = []
}

function checkIsValidModule(module: ModuleInfo) {
  // node_module will also marked as a virtual module, so virtual module need filter non-`nodeModules` modules
  const isNodeModule = module.id.includes('node_modules')
  if (!graphSettings.value.node_modules && isNodeModule)
    return false
  if (!graphSettings.value.virtual && module.virtual && !isNodeModule)
    return false
  if (!graphSettings.value.lib && !module.id.includes(projectRoot!.value) && !module.virtual)
    return false
  return true
}

// check valid module need also check it's reference is valid
function checkReferenceIsValid(modId: string) {
  const refer = moduleReferences.get(modId)
  return refer ? refer.some(ref => checkIsValidModule(ref.mod)) : true
}

// eslint-disable-next-line regexp/no-super-linear-backtracking
const EXTRACT_LAST_THREE_MOD_ID_RE = /(?:.*\/){3}([^/]+$)/

function updateGraph() {
  graphNodes.clear()
  graphEdges.clear()
  closeDrawer()

  // // Pathfinding mode: find and display paths between two nodes
  // if (graphPathfindingMode.value && graphPathfindingStart.value && graphPathfindingEnd.value) {
  //   // Search for modules matching the input text
  //   const startModules = searchModulesByText(graphPathfindingStart.value, 2)
  //   const endModules = searchModulesByText(graphPathfindingEnd.value, 4)

  //   // Find paths between all matching start and end modules
  //   const allPaths: PathInfo[] = []
  //   for (const startId of startModules) {
  //     const paths = findAllPaths(startId, endModules)
  //     allPaths.push(...paths)
  //   }

  //   graphPathfindingResults.value = allPaths

  //   if (allPaths.length > 0) {
  //     const { nodes, edges } = getPathNodesAndEdges(allPaths)
  //     graphNodes.add(uniqueNodes(nodes))
  //     graphEdges.add(uniqueEdges(edges))
  //   }
  //   toggleGraphDrawer(true)
  //   return
  // }

  const matchedNodes: Node[] = []
  const matchedSearchNodes: SearcherNode[] = []
  const matchedEdges: Edge[] = []

  if (graphPathfindingMode.value && graphPathfindingStart.value && graphPathfindingEnd.value) {
    // Search for modules matching the input text
    const startModules = searchModulesByText(graphPathfindingStart.value, 2)
    const endModules = searchModulesByText(graphPathfindingEnd.value, 4)

    const allNodes: GraphNodesTotalData[] = []
    const allEdges: Edge[] = []
    for (const startId of startModules) {
      const { nodes, edges } = findAllNodes(startId, endModules)
      allNodes.push(...nodes)
      allEdges.push(...edges)
    }

    const startModulesSet = new Set(startModules)
    const endModulesSet = new Set(endModules)
    allNodes.forEach(({ node, edges, mod }) => {
      const nodeId = mod.id
      if (startModulesSet.has(nodeId)) {
        node = markNode(node, 'start')
      }
      else if (endModulesSet.has(nodeId)) {
        node = markNode(node, 'end')
      }
      matchedNodes.push(node)
      // matchedEdges.push(...edges)
    })

    graphNodes.add(uniqueNodes(matchedNodes))
    graphEdges.add(uniqueEdges(allEdges))
    return
  }

  // reuse cache instead of parse every time
  const filterDataset = getGraphFilterDataset()
  const nodeData = !graphPathfindingMode.value && filterDataset ? filterDataset.slice() : graphNodesTotal.value.slice()
  nodeData.forEach(({ node, edges, mod }) => {
    if (checkIsValidModule(mod) && checkReferenceIsValid(mod.id)) {
      const shortId = mod.id.match(EXTRACT_LAST_THREE_MOD_ID_RE)?.[0] ?? mod.id
      matchedNodes.push(node)
      matchedSearchNodes.push({
        // only search the exactly name(last 3 segments), instead of full path
        id: shortId,
        fullId: mod.id,
        node,
        edges,
        deps: mod.deps,
        normalizedId: shortId.toLowerCase(),
        normalizedFullId: mod.id.toLowerCase(),
      })
      matchedEdges.push(...edges)
    }
  })

  // TODO: [fuzzy search graph node] use include, instead of fuse.js, for performance reasons
  // if someone need it, we can add it back
  const searchText = graphSearchText.value
  if (!graphPathfindingMode.value && searchText.trim().length) {
    const result = matchedSearchNodes.filter(({ id }) => id.includes(searchText))
    matchedEdges.length = 0
    matchedNodes.length = 0
    if (result.length) {
      const { node, edges } = recursivelyGetNodeByDep(result)
      // need recursively get all nodes and it's dependencies
      matchedNodes.push(...node)
      matchedEdges.push(...edges)
    }
  }

  graphNodes.add(uniqueNodes(matchedNodes))
  graphEdges.add(uniqueEdges(matchedEdges))
}

function recursivelyGetNodeByDep(node: SearcherNode[]) {
  const allNodes = new Map<string, Node>()
  const allEdges = new Map<string, Edge>()
  node.forEach((n) => {
    n = deepClone(n)
    // to highlight current searched node
    if (!n.node.font)
      n.node.font = { color: '#F19B4A' }
    n.node.label = `<b>${n.node.label}</b>`
    allNodes.set(n.fullId, n.node)
    n.deps.forEach((dep) => {
      const node = modulesMap.get(dep)
      // also check deps is valid
      if (node && checkIsValidModule(node.mod)) {
        allNodes.set(node.mod.id, node.node)
        allEdges.set(`${n.fullId}-${node.mod.id}`, getEdge(node.mod.id, n.fullId))
        node.edges.forEach(edge => allEdges.set(`${edge.from}-${edge.to}`, edge))
      }
    })
  })
  return {
    node: Array.from(allNodes.values()),
    edges: Array.from(allEdges.values()),
  }
}

// #endregion

// #region parse graph raw data
function getEdge(modId: string, dep: string) {
  return {
    from: modId,
    to: dep,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.8,
      },
      from: {
        enabled: true,
        type: 'circle',
        scaleFactor: 0.8,
      },
    },
  }
}

function removeVerbosePath(path: string) {
  // remove query, hash, and duplicate slash
  return path.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/{2,}/g, '/')
}

function isVueStyleFile(path: string) {
  // TODO: [check vue style file in graph] need consider edge case, let's leave it before someone report the issue
  return path.includes('vue&type=style')
}

export function removeRootPath(path: string) {
  return path.replace(projectRoot.value, '')
}

function determineNodeSize(depsLen: number) {
  return 15 + Math.min(depsLen / 2, 8)
}

function getUniqueDeps(deps: string[], processEachDep?: (dep: string) => void) {
  // remove vue style reference, e.g, a.vue -> a.vue?type=style, skip duplicate dep
  // don't use `mod.deps.filter`, will save filter overhead(for performance)
  const uniqueDeps: string[] = []
  deps.forEach((dep) => {
    if (isVueStyleFile(dep))
      return
    dep = removeVerbosePath(dep)
    // skip duplicate dep
    if (uniqueDeps.includes(dep))
      return
    uniqueDeps.push(dep)
    processEachDep?.(dep)
  })
  return uniqueDeps
}

export function parseGraphRawData(modules: ModuleInfo[], root: string) {
  if (!modules)
    return
  projectRoot.value = root
  graphNodes.clear()
  graphEdges.clear()

  const totalEdges: Edge[] = []
  const totalNode: Node[] = []

  modules.forEach((mod) => {
    // skip vue style file, a Vue file will have 2 modules(if has a style tag), one is script, one is style, we don't need style
    if (isVueStyleFile(mod.id))
      return
    mod.id = removeVerbosePath(mod.id)
    // skip duplicate module, merge their deps
    if (totalNode.some(node => node.id === mod.id)) {
      const nodeData = modulesMap.get(mod.id)!
      nodeData.node.size = determineNodeSize(nodeData.edges.length + mod.deps.length)
      const edges: Edge[] = []
      const uniqueDeps = getUniqueDeps(mod.deps, (dep) => {
        edges.push(getEdge(mod.id, dep))
      })
      const incrementalDeps = uniqueDeps.filter(dep => !nodeData.mod.deps.includes(dep))
      if (!incrementalDeps.length)
        return
      nodeData.mod.deps.push(...incrementalDeps)
      totalEdges.push(...edges)
      return
    }
    const path = mod.id
    const pathSegments = path.split('/')
    const displayName = pathSegments.at(-1) ?? ''
    const displayPath = removeRootPath(path)
    const node: GraphNodesTotalData = {
      mod,
      info: {
        displayName,
        displayPath,
      },
      node: {
        id: mod.id,
        label: displayName,
        group: path.match(/\.(\w+)$/)?.[1] || 'unknown',
        size: determineNodeSize(mod.deps.length),
        shape: mod.id.includes('/node_modules/')
          ? 'hexagon'
          : mod.virtual
            ? 'diamond'
            : 'dot',
      },
      edges: [],
    }

    const uniqueDeps = getUniqueDeps(mod.deps, (dep) => {
      node.edges.push(getEdge(mod.id, dep))
      // save references
      if (!moduleReferences.has(dep))
        moduleReferences.set(dep, [])
      const moduleReferencesValue = moduleReferences.get(dep)!
      const displayPath = removeRootPath(path)
      const isExist = !!(moduleReferencesValue.find(item => item.path === path && item.displayPath === displayPath && item.mod.id === mod.id))
      if (isExist)
        return

      moduleReferencesValue.push({
        path,
        displayPath,
        mod,
      })
    })
    mod.deps = uniqueDeps
    graphNodesTotal.value.push(node)
    graphNodesTotalMap.set(mod.id, node)

    // save cache, to speed up search
    modulesMap.set(mod.id, node)

    // first time, we also need check
    if (checkIsValidModule(mod) && checkReferenceIsValid(mod.id)) {
      totalNode.push(node.node)
      totalEdges.push(...node.edges)
    }
  })
  // set initial data
  // nodes has been unique in `modules.forEach`
  graphNodes.add(totalNode.slice())
  graphEdges.add(uniqueEdges(totalEdges))
}
// #endregion

// #region drawer
export interface DrawerData {
  name: string
  path: string
  displayPath: string
  refs: { path: string, displayPath: string }[]
  deps: { path: string, displayPath: string }[]
}

function closeDrawer() {
  toggleGraphDrawer(false)
}

export function updateGraphDrawerData(nodeId: string): DrawerData | undefined {
  const node = modulesMap.get(nodeId)
  if (!node)
    return

  const deps = node.mod.deps.reduce<DrawerData['deps']>((prev, dep) => {
    const moduleData = modulesMap.get(dep)
    if (!moduleData)
      return prev
    if (checkIsValidModule(moduleData.mod)) {
      prev.push({
        path: dep,
        displayPath: removeRootPath(removeVerbosePath(dep)),
      })
    }
    return prev
  }, [])

  const refsData = moduleReferences.get(node.mod.id) || []
  const refs = refsData.reduce<DrawerData['deps']>((prev, ref) => {
    const moduleData = modulesMap.get(ref.path)
    if (!moduleData)
      return prev
    if (checkIsValidModule(moduleData.mod)) {
      prev.push({
        path: ref.path,
        displayPath: ref.displayPath,
      })
    }
    return prev
  }, [])

  graphDrawerData.value = {
    name: node.info.displayName,
    displayPath: node.info.displayPath,
    path: node.mod.id,
    deps,
    refs,
  }
}
// #endregion

// #region graph filter

watch(graphFilterNodeId, () => {
  updateGraph()
})

export function getGraphFilterDataset() {
  const nodeId = graphFilterNodeId.value
  graphFilterNodeId.value = nodeId
  if (!nodeId)
    return null
  const node = modulesMap.get(nodeId)
  if (!node)
    return null
  const existingNodeIds = new Set<string>()
  const dataset = recursivelyGetGraphNodeData(nodeId, existingNodeIds, 0)
  return dataset
}

// max depth is 20
function recursivelyGetGraphNodeData(nodeId: string, existingNodeIds: Set<string>, depth: number): GraphNodesTotalData[] {
  if (existingNodeIds.has(nodeId)) {
    return []
  }
  const node = modulesMap.get(nodeId)
  depth += 1
  if (!node || depth > 20)
    return []
  const result = [node]
  existingNodeIds.add(nodeId)
  node.mod.deps.forEach((dep) => {
    const node = modulesMap.get(dep)
    if (node)
      result.push(...recursivelyGetGraphNodeData(node.mod.id, existingNodeIds, depth))
  })
  // unique result
  return result.reduce<GraphNodesTotalData[]>((prev, node) => {
    if (!prev.some(n => n.mod.id === node.mod.id))
      prev.push(node)
    return prev
  }, [])
}
// #endregion

// #region pathfinding functions
/**
 * Search for module IDs that match the given search text
 * Returns array of full module IDs that contain the search text
 */
function searchModulesByText(searchText: string, maxItems = -1): string[] {
  const results: string[] = []
  const search = searchText.toLowerCase()

  for (const [moduleId, nodeData] of modulesMap) {
    if (maxItems !== -1 && results.length >= maxItems) {
      break
    }
    const displayName = nodeData.info.displayName.toLowerCase()
    const fullPath = moduleId.toLowerCase()

    if (displayName.includes(search) || fullPath.includes(search)) {
      results.push(moduleId)
    }
  }

  return results
}

export function findAllNodes(startId: string, endIds: string[]): {
  nodes: GraphNodesTotalData[]
  edges: Edge[]
} {
  const node = modulesMap.get(startId)
  if (!node) {
    return {
      nodes: [],
      edges: [],
    }
  }

  const result: [Set<GraphNodesTotalData>, Set<Edge>] = [new Set<GraphNodesTotalData>(), new Set<Edge>()]

  dfs(node, new Set(endIds), new Set(), modulesMap, result)

  return {
    nodes: Array.from(result[0]),
    edges: Array.from(result[1]),
  }
}

function dfs(node: GraphNodesTotalData, targetIds: Set<string>, existingNodeIds: Set<GraphNodesTotalData>, modulesMap: Map<string, GraphNodesTotalData>, result: [Set<GraphNodesTotalData>, Set<Edge>]): boolean {
  if (!node) {
    return false
  }
  const [resNodes, resEdges] = result
  if (existingNodeIds.has(node)) {
    return resNodes.has(node)
  }
  existingNodeIds.add(node)

  const nodeId = node.mod.id
  const isTarget = targetIds.has(nodeId)
  let hasTarget = isTarget

  node.mod.deps.forEach((dep) => {
    const childNode = modulesMap.get(dep)
    if (childNode && checkIsValidModule(childNode.mod)) {
      const isFound = dfs(childNode, targetIds, existingNodeIds, modulesMap, result)
      if (isFound) {
        node.edges.find((edge) => {
          if (edge.to === childNode.mod.id) {
            resEdges.add(edge)
            return true
          }
          return false
        })
      }
      hasTarget ||= isFound
    }
  })

  if (hasTarget) {
    resNodes.add(node)
  }

  return hasTarget
}

/**
 * Find all paths from start node to end node using DFS
 * Returns array of paths, where each path is an array of module IDs
 */
export function findAllPaths(startId: string, endIds: string[], maxDepth = 40): PathInfo[] {
  const paths: PathInfo[] = []
  const theNodes: Set<GraphNodesTotalData> = new Set()
  const visited = new Set<string>()

  function dfs(currentId: string, targetIds: Set<string>, currentPath: string[], depth: number) {
    // Prevent infinite loops and limit depth
    if (depth > maxDepth || visited.has(currentId)) {
      return
    }

    // Add current node to path
    currentPath.push(currentId)

    // Mark as visited for this path
    visited.add(currentId)

    // Found the target
    if (targetIds.has(currentId)) {
      // Convert to display format
      const displayPath = currentPath.map((id) => {
        const node = modulesMap.get(id)
        return node?.info.displayName ?? id.split('/').at(-1) ?? id
      })
      paths.push({
        path: [...currentPath],
        displayPath,
      })
    }

    // Get current node's dependencies
    const node = modulesMap.get(currentId)
    if (node) {
      for (const dep of node.mod.deps) {
        if (!visited.has(dep) && checkIsValidModule(modulesMap.get(dep)!.mod!)) {
          dfs(dep, targetIds, currentPath, depth + 1)
        }
      }
    }

    // Backtrack
    // visited.delete(currentId)
    currentPath.pop()
  }

  dfs(startId, new Set(endIds), [], 0)
  return paths
}

/**
 * Get all nodes and edges involved in the found paths
 */
function getPathNodesAndEdges(paths: PathInfo[]): { nodes: Node[], edges: Edge[] } {
  const allNodes = new Map<string, Node>()
  const allEdges = new Map<string, Edge>()

  paths.forEach((pathInfo, pathIndex) => {
    const { path } = pathInfo

    path.forEach((nodeId, index) => {
      const nodeData = modulesMap.get(nodeId)
      if (nodeData) {
        const node = deepClone(nodeData.node)

        // Highlight nodes in the path
        if (!node.font) {
          node.font = {}
        }

        // Use different colors for start, end, and intermediate nodes
        if (index === 0) {
          // Start node - green
          (node.font as Font).color = '#10b981'
          node.borderWidth = 3
          node.color = { border: '#10b981' }
        }
        else if (index === path.length - 1) {
          // End node - red
          (node.font as Font).color = '#ef4444'
          node.borderWidth = 3
          node.color = { border: '#ef4444' }
        }
        else {
          // Intermediate nodes - orange
          (node.font as Font).color = '#f59e0b'
        }

        node.label = `<b>${node.label}</b>`
        allNodes.set(nodeId, node)
      }

      // Add edge to next node in path
      if (index < path.length - 1) {
        const nextNodeId = path[index + 1]
        const edgeKey = `${nodeId}-${nextNodeId}`
        const edge = {
          from: nodeId,
          to: nextNodeId,
          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.8,
            },
          },
          // Highlight the edges in the path
          color: { color: '#f59e0b', highlight: '#f59e0b' },
          width: 2,
        }
        allEdges.set(edgeKey, edge)
      }
    })
  })

  return {
    nodes: Array.from(allNodes.values()),
    edges: Array.from(allEdges.values()),
  }
}

function markNode(node: Node, type: 'start' | 'end') {
  node = deepClone(node)

  if (!node.font || typeof node.font !== 'object') {
    node.font = {}
  }

  // Use different colors for start, end, and intermediate nodes
  if (type === 'start') {
    // Start node - green
    node.font.color = '#f59e0b'
    node.borderWidth = 3
    node.color = { border: '#f59e0b' }
  }
  else if (type === 'end') {
    // End node - red
    node.font.color = '#ef4444'
    node.borderWidth = 3
    node.color = { border: '#ef4444' }
  }

  node.label = `<b>${node.label}</b>`

  return node
}
// #endregion

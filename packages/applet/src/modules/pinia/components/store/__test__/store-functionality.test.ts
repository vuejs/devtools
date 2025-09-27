import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

// Test the core functionality of the Pinia Store optimization features
describe('pinia Store Optimization Features', () => {
  let expandedTreeNodes: any
  let expandedStateNodes: any
  let tree: any
  let state: any

  const mockTreeData = [
    {
      id: 'store1',
      label: 'Counter Store',
      children: [
        { id: 'store1-state', label: 'state', children: [] },
        { id: 'store1-getters', label: 'getters', children: [] },
      ],
    },
    {
      id: 'store2',
      label: 'User Store',
      children: [
        { id: 'store2-state', label: 'state', children: [] },
        { id: 'store2-actions', label: 'actions', children: [] },
      ],
    },
  ]

  const mockStateData = {
    state: [
      { key: 'user', value: { name: 'John', age: 30, settings: { theme: 'dark' } } },
      { key: 'products', value: [{ id: 1, name: 'Product 1' }, { id: 2, name: 'Product 2' }] },
    ],
    getters: [
      { key: 'userDisplayName', value: 'John (30)' },
    ],
  }

  beforeEach(() => {
    expandedTreeNodes = ref([])
    expandedStateNodes = ref([])
    tree = ref([])
    state = ref({})
  })

  describe('expand All Tree Nodes', () => {
    function expandAllTreeNodes() {
      const getAllNodeIds = (nodes: any[]): string[] => {
        const ids: string[] = []
        const traverse = (node: any) => {
          ids.push(node.id)
          if (node.children && node.children.length > 0) {
            node.children.forEach(traverse)
          }
        }
        nodes.forEach(traverse)
        return ids
      }
      expandedTreeNodes.value = getAllNodeIds(tree.value)
    }

    it('should expand all tree nodes recursively', async () => {
      tree.value = mockTreeData

      expandAllTreeNodes()

      const expectedIds = ['store1', 'store1-state', 'store1-getters', 'store2', 'store2-state', 'store2-actions']
      expectedIds.forEach((id) => {
        expect(expandedTreeNodes.value).toContain(id)
      })
      expect(expandedTreeNodes.value).toHaveLength(6)
    })

    it('should handle empty tree data', () => {
      tree.value = []

      expandAllTreeNodes()

      expect(expandedTreeNodes.value).toEqual([])
    })

    it('should handle deeply nested tree structures', () => {
      const deepTree = [
        {
          id: 'root',
          children: [
            {
              id: 'level1',
              children: [
                {
                  id: 'level2',
                  children: [
                    { id: 'level3', children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ]
      tree.value = deepTree

      expandAllTreeNodes()

      expect(expandedTreeNodes.value).toEqual(['root', 'level1', 'level2', 'level3'])
    })
  })

  describe('collapse All Tree Nodes', () => {
    function collapseAllTreeNodes() {
      expandedTreeNodes.value = []
    }

    it('should collapse all tree nodes', () => {
      expandedTreeNodes.value = ['store1', 'store2', 'store1-state']

      collapseAllTreeNodes()

      expect(expandedTreeNodes.value).toEqual([])
    })
  })

  describe('expand All State Nodes', () => {
    function expandAllStateNodes() {
      const getAllStateIds = (obj: any, prefix = ''): string[] => {
        const ids: string[] = []

        if (prefix) {
          ids.push(prefix)
        }

        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            const path = prefix ? `${prefix}.${index}` : `${index}`
            ids.push(...getAllStateIds(item, path))
          })
        }
        else if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach((key) => {
            const path = prefix ? `${prefix}.${key}` : key
            ids.push(...getAllStateIds(obj[key], path))
          })
        }

        return ids
      }

      const allIds: string[] = []
      Object.keys(state.value).forEach((section, sectionIndex) => {
        allIds.push(`${sectionIndex}`)
        if (state.value[section] && Array.isArray(state.value[section])) {
          state.value[section].forEach((item: any, itemIndex: number) => {
            allIds.push(...getAllStateIds(item, `${sectionIndex}.${itemIndex}`))
          })
        }
      })

      expandedStateNodes.value = [...new Set(allIds)]
    }

    it('should expand all state nodes including nested objects and arrays', () => {
      state.value = mockStateData

      expandAllStateNodes()

      expect(expandedStateNodes.value).toContain('0') // state section
      expect(expandedStateNodes.value).toContain('1') // getters section
      expect(expandedStateNodes.value.length).toBeGreaterThan(2)
    })

    it('should handle complex nested state structures', () => {
      state.value = {
        state: [
          {
            key: 'complex',
            value: {
              user: { profile: { settings: { theme: 'dark' } } },
              items: [{ id: 1, meta: { tags: ['a', 'b'] } }],
            },
          },
        ],
      }

      expandAllStateNodes()

      expect(expandedStateNodes.value).toContain('0')
      expect(expandedStateNodes.value).toContain('0.0')
      expect(expandedStateNodes.value.length).toBeGreaterThan(1)
    })

    it('should handle empty state', () => {
      state.value = {}

      expandAllStateNodes()

      expect(expandedStateNodes.value).toEqual([])
    })

    it('should remove duplicates from expanded nodes', () => {
      state.value = {
        state: [
          { key: 'a', value: { x: 1 } },
          { key: 'b', value: { x: 2 } },
        ],
      }

      expandAllStateNodes()

      const uniqueIds = [...new Set(expandedStateNodes.value)]
      expect(expandedStateNodes.value).toEqual(uniqueIds)
    })
  })

  describe('collapse All State Nodes', () => {
    function collapseAllStateNodes() {
      expandedStateNodes.value = []
    }

    it('should collapse all state nodes', () => {
      expandedStateNodes.value = ['0', '0.0', '0.1', '1']

      collapseAllStateNodes()

      expect(expandedStateNodes.value).toEqual([])
    })
  })

  describe('tree Utility Functions', () => {
    function flattenTreeNodes(tree: any[]) {
      const res: any[] = []
      const find = (treeNode: any[]) => {
        treeNode?.forEach((item) => {
          res.push(item)
          if (item.children?.length)
            find(item.children)
        })
      }
      find(tree)
      return res
    }

    function dfs(node: any, path: string[] = [], linkedList: string[][] = []) {
      path.push(node.id)
      if (node.children?.length === 0)
        linkedList.push([...path])

      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          dfs(child, path, linkedList)
        })
      }

      path.pop()
      return linkedList
    }

    function getNodesByDepth(list: string[][], depth: number) {
      const nodes: string[] = []
      list?.forEach((item) => {
        nodes.push(...item.slice(0, depth + 1))
      })
      return [...new Set(nodes)]
    }

    it('should flatten tree nodes correctly', () => {
      const flattened = flattenTreeNodes(mockTreeData)

      expect(flattened).toHaveLength(6)
      expect(flattened.map(node => node.id)).toEqual([
        'store1',
        'store1-state',
        'store1-getters',
        'store2',
        'store2-state',
        'store2-actions',
      ])
    })

    it('should perform DFS traversal correctly', () => {
      const linkedList = dfs(mockTreeData[0])

      expect(linkedList).toEqual([
        ['store1', 'store1-state'],
        ['store1', 'store1-getters'],
      ])
    })

    it('should get nodes by depth correctly', () => {
      const linkedList = [
        ['store1', 'store1-state'],
        ['store1', 'store1-getters'],
        ['store2', 'store2-state', 'nested'],
      ]

      const nodesDepth1 = getNodesByDepth(linkedList, 1)
      expect(nodesDepth1).toContain('store1')
      expect(nodesDepth1).toContain('store2')
      expect(nodesDepth1).toContain('store1-state')
      expect(nodesDepth1).toContain('store2-state')

      const nodesDepth2 = getNodesByDepth(linkedList, 2)
      expect(nodesDepth2).toContain('nested')
    })

    it('should handle empty tree in flatten function', () => {
      const flattened = flattenTreeNodes([])
      expect(flattened).toEqual([])
    })

    it('should handle single node without children in DFS', () => {
      const singleNode = { id: 'single', children: [] }
      const linkedList = dfs(singleNode)
      expect(linkedList).toEqual([['single']])
    })
  })

  describe('search and Auto-expansion', () => {
    function simulateSearch(searchTerm: string, treeData: any[]) {
      // Simulate the search logic that auto-expands when searching
      if (searchTerm.trim().length > 0) {
        // Get all node IDs for auto-expansion
        const getAllNodeIds = (nodes: any[]): string[] => {
          const ids: string[] = []
          const traverse = (node: any) => {
            ids.push(node.id)
            if (node.children && node.children.length > 0) {
              node.children.forEach(traverse)
            }
          }
          nodes.forEach(traverse)
          return ids
        }
        return getAllNodeIds(treeData)
      }
      return []
    }

    it('should auto-expand all nodes when searching', () => {
      const searchTerm = 'Counter'
      const expandedIds = simulateSearch(searchTerm, mockTreeData)

      expect(expandedIds).toContain('store1')
      expect(expandedIds).toContain('store1-state')
      expect(expandedIds).toContain('store1-getters')
      expect(expandedIds).toContain('store2')
      expect(expandedIds).toContain('store2-state')
      expect(expandedIds).toContain('store2-actions')
    })

    it('should not auto-expand for empty search', () => {
      const searchTerm = ''
      const expandedIds = simulateSearch(searchTerm, mockTreeData)

      expect(expandedIds).toEqual([])
    })

    it('should auto-expand for whitespace-only search', () => {
      const searchTerm = '   '
      const expandedIds = simulateSearch(searchTerm, mockTreeData)

      expect(expandedIds).toEqual([])
    })
  })

  describe('default Expansion Behavior', () => {
    function getNodesByDepth(list: string[][], depth: number) {
      const nodes: string[] = []
      list?.forEach((item) => {
        nodes.push(...item.slice(0, depth + 1))
      })
      return [...new Set(nodes)]
    }

    function dfs(node: any, path: string[] = [], linkedList: string[][] = []) {
      path.push(node.id)
      if (node.children?.length === 0)
        linkedList.push([...path])

      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          dfs(child, path, linkedList)
        })
      }

      path.pop()
      return linkedList
    }

    it('should auto-expand first 4 levels by default for better UX', () => {
      const treeNodeLinkedList = mockTreeData.length ? dfs(mockTreeData[0]) : []
      const expandedNodes = getNodesByDepth(treeNodeLinkedList, 4)

      expect(expandedNodes.length).toBeGreaterThan(0)
      expect(expandedNodes).toContain('store1')
      expect(expandedNodes).toContain('store1-state')
      expect(expandedNodes).toContain('store1-getters')
    })
  })
})

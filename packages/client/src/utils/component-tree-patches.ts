import type { ComponentTreeNodeSnapshot, ComponentTreePatch } from '@vue/devtools-kit'

// Snapshots are immutable. Attribute-only patches can share their positional
// index without rebuilding parent/child maps or walking the tree again.
const snapshotIndices = new WeakMap<ComponentTreeNodeSnapshot[], Map<string, number>>()

export function applyComponentTreePatches(
  nodes: ComponentTreeNodeSnapshot[],
  patches: ComponentTreePatch[],
): ComponentTreeNodeSnapshot[] {
  if (!patches.length) return nodes
  if (
    patches.every(
      (patch) =>
        patch.op === 'update' && !('parentId' in patch.changes) && !('id' in patch.changes),
    )
  ) {
    let index = snapshotIndices.get(nodes)
    if (!index) {
      index = new Map(nodes.map((node, position) => [node.id, position]))
      snapshotIndices.set(nodes, index)
    }
    let next: ComponentTreeNodeSnapshot[] | undefined
    for (const patch of patches) {
      if (patch.op !== 'update') continue
      const position = index.get(patch.id)
      if (position == null) continue
      next ??= nodes.slice()
      next[position] = { ...next[position]!, ...patch.changes }
    }
    if (!next) return nodes
    snapshotIndices.set(next, index)
    return next
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string | undefined, Set<string>>()

  function addChild(node: ComponentTreeNodeSnapshot) {
    const parentId = node.parentId
    const siblings = children.get(parentId) ?? new Set<string>()
    siblings.add(node.id)
    children.set(parentId, siblings)
  }
  for (const node of nodes) addChild(node)

  for (const patch of patches) {
    switch (patch.op) {
      case 'insert':
      case 'update': {
        const id = patch.op === 'insert' ? patch.node.id : patch.id
        const previous = byId.get(id)
        if (patch.op === 'update' && !previous) break
        const next = patch.op === 'insert' ? patch.node : { ...previous!, ...patch.changes }
        if (previous) children.get(previous.parentId)?.delete(id)
        byId.set(id, next)
        addChild(next)
        break
      }
      case 'remove': {
        const queue = [patch.id]
        for (const id of queue) {
          for (const childId of children.get(id) ?? []) queue.push(childId)
          const node = byId.get(id)
          if (node) children.get(node.parentId)?.delete(id)
          children.delete(id)
          byId.delete(id)
        }
        break
      }
      case 'reorder':
        reorderSiblings(byId, patch.children)
        break
    }
  }

  return orderComponentTree([...byId.values()])
}

// Siblings render in insertion order, so move the listed ones to the first
// listed sibling's slot in the given order.
function reorderSiblings(byId: Map<string, ComponentTreeNodeSnapshot>, order: string[]): void {
  const listed = new Set(order)
  const previous = new Map(byId)
  byId.clear()
  let placed = false
  for (const [id, node] of previous) {
    if (!listed.has(id)) {
      byId.set(id, node)
    } else if (!placed) {
      placed = true
      for (const orderedId of order) {
        const ordered = previous.get(orderedId)
        if (ordered) byId.set(orderedId, ordered)
      }
    }
  }
}

function orderComponentTree(nodes: ComponentTreeNodeSnapshot[]): ComponentTreeNodeSnapshot[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string | undefined, ComponentTreeNodeSnapshot[]>()
  for (const node of nodes) {
    const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : undefined
    const siblings = children.get(parentId) ?? []
    siblings.push(node)
    children.set(parentId, siblings)
  }

  const ordered: ComponentTreeNodeSnapshot[] = []
  const visited = new Set<string>()
  const stack = [...(children.get(undefined) ?? [])].reverse()
  while (stack.length) {
    const node = stack.pop()!
    if (visited.has(node.id)) continue
    visited.add(node.id)
    ordered.push(node)
    const descendants = children.get(node.id) ?? []
    for (let index = descendants.length - 1; index >= 0; index--) stack.push(descendants[index]!)
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) ordered.push(node)
  }
  return ordered
}

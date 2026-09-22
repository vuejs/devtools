import type { ComponentTreeNodeSnapshot } from '../../../packages/kit/src/protocol'
import { describe, expect, it } from 'vitest'
import { applyComponentTreePatches } from '../../../packages/client/src/utils/component-tree-patches'

function node(id: string, parentId?: string): ComponentTreeNodeSnapshot {
  return { id, parentId, appId: 'app:0', name: id, updatedAt: 1 }
}

describe('component tree patch application', () => {
  it('keeps attribute patches immutable across repeated updates and structural changes', () => {
    const nodes = [node('root'), node('child', 'root'), node('other')]
    const updated = applyComponentTreePatches(nodes, [
      { op: 'update', id: 'child', changes: { name: 'first' } },
      { op: 'update', id: 'child', changes: { updatedAt: 2 } },
    ])
    expect(updated[0]).toBe(nodes[0])
    expect(updated[1]).toMatchObject({ name: 'first', updatedAt: 2 })
    expect(nodes[1]?.name).toBe('child')
    const moved = applyComponentTreePatches(updated, [
      { op: 'update', id: 'child', changes: { parentId: 'other' } },
    ])
    const renamed = applyComponentTreePatches(moved, [
      { op: 'update', id: 'child', changes: { name: 'second' } },
    ])
    expect(renamed.map((item) => item.id)).toEqual(['root', 'other', 'child'])
    expect(renamed[2]?.name).toBe('second')
    expect(updated[1]?.name).toBe('first')
    expect(
      applyComponentTreePatches(renamed, [
        { op: 'update', id: 'missing', changes: { name: 'ignored' } },
      ]),
    ).toBe(renamed)
  })
  it('applies mixed reparent, insert and removal patches in order without mutating the snapshot', () => {
    const nodes = [node('root'), node('child', 'root'), node('grandchild', 'child'), node('other')]
    const result = applyComponentTreePatches(nodes, [
      { op: 'update', id: 'child', changes: { parentId: 'other', name: 'Moved' } },
      { op: 'insert', node: node('new', 'root') },
      { op: 'remove', id: 'root' },
      { op: 'update', id: 'grandchild', changes: { name: 'Updated' } },
    ])
    expect(result.map((item) => item.id)).toEqual(['other', 'child', 'grandchild'])
    expect(result[1]?.name).toBe('Moved')
    expect(result[2]?.name).toBe('Updated')
    expect(nodes[1]).toMatchObject({ name: 'child', parentId: 'root' })
    expect(nodes).toHaveLength(4)
  })

  it('supports repeated removals and reinserting a subtree in the same batch', () => {
    const result = applyComponentTreePatches(
      [node('root'), node('child', 'root')],
      [
        { op: 'remove', id: 'root' },
        { op: 'remove', id: 'child' },
        { op: 'insert', node: node('root') },
        { op: 'insert', node: node('child', 'root') },
      ],
    )
    expect(result.map((item) => item.id)).toEqual(['root', 'child'])
  })

  it('orders very deep trees iteratively and keeps orphan nodes visible', () => {
    const nodes = Array.from({ length: 10_000 }, (_, index) =>
      node(String(index), index ? String(index - 1) : undefined),
    )
    const result = applyComponentTreePatches(nodes, [
      { op: 'insert', node: node('orphan', 'missing') },
    ])
    expect(result.map((item) => item.id)).toEqual([...nodes.map((item) => item.id), 'orphan'])
  })
})

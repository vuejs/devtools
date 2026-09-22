import { describe, expect, it } from 'vitest'
import { ValueHandleRegistry } from '../../../packages/kit/src/codec/handles'

describe('ValueHandleRegistry', () => {
  it('reuses the same handle for the same object', () => {
    const registry = new ValueHandleRegistry()
    const value = {}

    expect(registry.getOrCreate(value)).toBe(registry.getOrCreate(value))
    expect(registry.size).toBe(1)
  })

  it('releases every handle in a scope without touching other scopes', () => {
    const registry = new ValueHandleRegistry()
    const first = {}
    const second = {}
    const other = {}

    const firstHandle = registry.getOrCreate(first, 'state:component-a')
    const secondHandle = registry.getOrCreate(second, 'state:component-a')
    const otherHandle = registry.getOrCreate(other, 'state:component-b')

    expect(registry.releaseScope('state:component-a')).toBe(2)
    expect(registry.get(firstHandle)).toBeUndefined()
    expect(registry.get(secondHandle)).toBeUndefined()
    expect(registry.get(otherHandle)).toBe(other)
    expect(registry.size).toBe(1)
  })

  it('creates a fresh handle after its scope was released', () => {
    const registry = new ValueHandleRegistry()
    const value = {}

    const stale = registry.getOrCreate(value, 'state:component-a')
    registry.releaseScope('state:component-a')

    const fresh = registry.getOrCreate(value, 'state:component-a')
    expect(fresh).not.toBe(stale)
    expect(registry.get(fresh)).toBe(value)
    expect(registry.get(stale)).toBeUndefined()
  })

  it('evicts the oldest handles beyond maxHandles', () => {
    const registry = new ValueHandleRegistry({ maxHandles: 2 })
    const first = {}
    const second = {}
    const third = {}

    const firstHandle = registry.getOrCreate(first)
    const secondHandle = registry.getOrCreate(second)
    const thirdHandle = registry.getOrCreate(third)

    expect(registry.size).toBe(2)
    expect(registry.get(firstHandle)).toBeUndefined()
    expect(registry.get(secondHandle)).toBe(second)
    expect(registry.get(thirdHandle)).toBe(third)

    const regenerated = registry.getOrCreate(first)
    expect(regenerated).not.toBe(firstHandle)
    expect(registry.get(regenerated)).toBe(first)
    expect(registry.size).toBe(2)
  })

  it('tracks scope membership for expanded child values', () => {
    const registry = new ValueHandleRegistry()
    const parent = {}
    const child = {}

    const parentHandle = registry.getOrCreate(parent, 'state:component-a')
    const childHandle = registry.getOrCreate(child, registry.getScope(parentHandle))

    expect(registry.getScope(childHandle)).toBe('state:component-a')
    registry.releaseScope('state:component-a')
    expect(registry.get(childHandle)).toBeUndefined()
  })
})

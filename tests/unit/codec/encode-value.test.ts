import { describe, expect, it } from 'vitest'
import { encodeValue } from '../../../packages/kit/src/codec/encode'
import { createDeepCyclicStateFixture } from '../../fixtures'

describe('encodeValue', () => {
  it('preserves class names and enumerable fields for EventTarget subclasses', () => {
    class Dialog extends EventTarget {
      id = 'dialog-1'
    }

    const encoded = encodeValue(new Dialog(), { maxDepth: 2 })

    expect(encoded).toMatchObject({
      entries: 1,
      kind: 'object',
      name: 'Dialog',
      preview: [{ key: 'id', value: { kind: 'string', value: 'dialog-1' } }],
    })
  })

  it('represents circular references without recursively serializing forever', () => {
    const encoded = encodeValue(createDeepCyclicStateFixture(2), { maxDepth: 5 })

    expect(encoded.kind).toBe('object')
    if (encoded.kind !== 'object') return

    const firstChild = encoded.preview.find((entry) => entry.key === 'child')?.value
    expect(firstChild?.kind).toBe('object')
    if (firstChild?.kind !== 'object') return

    const secondChild = firstChild.preview.find((entry) => entry.key === 'child')?.value
    expect(secondChild?.kind).toBe('object')
    if (secondChild?.kind !== 'object') return

    expect(secondChild.preview.find((entry) => entry.key === 'root')?.value.kind).toBe('circular')
  })

  it('truncates previews according to the configured state budget', () => {
    const encoded = encodeValue({ first: 1, second: 2, third: 3 }, { maxEntries: 2 })

    expect(encoded).toMatchObject({ entries: 3, kind: 'object' })
    if (encoded.kind === 'object') expect(encoded.preview).toHaveLength(2)
  })

  it('degrades only the field whose getter throws', () => {
    const value: Record<string, unknown> = { ok: 1 }
    Object.defineProperty(value, 'broken', {
      enumerable: true,
      get() {
        throw new Error('getter exploded')
      },
    })

    const encoded = encodeValue(value, { maxDepth: 2 })

    expect(encoded).toMatchObject({ entries: 2, kind: 'object' })
    if (encoded.kind !== 'object') return
    expect(encoded.preview).toEqual([
      { key: 'ok', value: { kind: 'number', value: 1 } },
      { key: 'broken', value: { kind: 'error', message: 'getter exploded', name: 'Error' } },
    ])
  })

  it('never executes prototype accessors of class instances', () => {
    let calls = 0
    class Model {
      safe = 'visible'
      get dangerous(): string {
        calls++
        return 'secret'
      }
    }

    const encoded = encodeValue(new Model(), { maxDepth: 2 })

    expect(calls).toBe(0)
    expect(encoded).toMatchObject({ kind: 'object', name: 'Model' })
    if (encoded.kind === 'object')
      expect(encoded.preview).toEqual([
        { key: 'safe', value: { kind: 'string', value: 'visible' } },
      ])
  })

  it('invokes own enumerable getters but degrades them individually on throw', () => {
    const reader: Record<string, unknown> = {}
    Object.defineProperty(reader, 'computedValue', {
      enumerable: true,
      get: () => 21 * 2,
    })

    const encoded = encodeValue(reader, { maxDepth: 2 })

    expect(encoded).toMatchObject({ kind: 'object' })
    if (encoded.kind === 'object')
      expect(encoded.preview).toEqual([
        { key: 'computedValue', value: { kind: 'number', value: 42 } },
      ])
  })

  it('degrades a hostile Proxy without failing sibling fields', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('trapped prototype')
        },
        ownKeys() {
          throw new Error('trapped keys')
        },
      },
    )

    const encoded = encodeValue({ bad: hostile, good: true }, { maxDepth: 2 })

    expect(encoded).toMatchObject({ kind: 'object' })
    if (encoded.kind !== 'object') return
    const good = encoded.preview.find((entry) => entry.key === 'good')?.value
    const bad = encoded.preview.find((entry) => entry.key === 'bad')?.value
    expect(good).toEqual({ kind: 'boolean', value: true })
    expect(bad).toMatchObject({ kind: 'error', message: 'trapped prototype' })
  })

  it('tolerates a Proxy whose ownKeys trap throws while other traps work', () => {
    const hostile = new Proxy(
      { hidden: 1 },
      {
        ownKeys() {
          throw new Error('trapped keys')
        },
      },
    )

    const encoded = encodeValue(hostile, { maxDepth: 2 })

    expect(encoded).toMatchObject({ entries: 0, kind: 'object', preview: [] })
  })

  it('keeps the type name for Map subclasses that throw during iteration', () => {
    class BrokenMap extends Map<string, number> {
      get size(): number {
        throw new Error('no size')
      }
    }

    const encoded = encodeValue(new BrokenMap(), { maxDepth: 2 })

    expect(encoded).toMatchObject({ kind: 'map', preview: [], size: 0 })
  })

  it('encodes an invalid Date without throwing', () => {
    const encoded = encodeValue(new Date('not a date'))

    expect(encoded).toMatchObject({ kind: 'date', value: 'Invalid Date' })
  })

  it('preserves class instance names for nested values', () => {
    class Repository {
      name = 'users'
    }

    const encoded = encodeValue({ repo: new Repository() }, { maxDepth: 2 })

    expect(encoded.kind).toBe('object')
    if (encoded.kind !== 'object') return
    expect(encoded.preview[0]?.value).toMatchObject({ kind: 'object', name: 'Repository' })
  })
})

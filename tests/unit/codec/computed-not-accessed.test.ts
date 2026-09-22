import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  encodeValue,
  isComputedRef,
  isUnaccessedComputed,
  NOT_ACCESSED_COMPUTED_DISPLAY,
  NOT_ACCESSED_COMPUTED_TYPE,
} from '../../../packages/kit/src/codec'

describe('unaccessed computed encoding', () => {
  it('encodes a computed that has never been read as not accessed without running the getter', () => {
    // https://github.com/vuejs/devtools/issues/535
    let runs = 0
    const value = computed(() => {
      runs++
      return 'expensive'
    })

    const encoded = encodeValue(value)

    expect(runs).toBe(0)
    expect(encoded).toMatchObject({
      abstract: true,
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      kind: 'custom',
      readOnly: true,
      type: NOT_ACCESSED_COMPUTED_TYPE,
      value: { kind: 'undefined' },
    })
    expect(encoded.kind === 'custom' && encoded.display).not.toBe('undefined')
  })

  it('encodes the cached value after the computed is accessed', () => {
    let runs = 0
    const value = computed(() => {
      runs++
      return 'ready'
    })

    expect(value.value).toBe('ready')
    expect(runs).toBe(1)

    const encoded = encodeValue(value)

    expect(runs).toBe(1)
    expect(encoded).toEqual({ kind: 'string', value: 'ready' })
  })

  it('encodes a real undefined result as undefined after the computed is accessed', () => {
    const value = computed(() => undefined)

    expect(value.value).toBeUndefined()
    expect(encodeValue(value)).toEqual({ kind: 'undefined' })
  })

  it('treats Vue 3.4 dirty-never-run computeds as not accessed and dirty-after-run as the cached value', () => {
    const neverRun = {
      __v_isRef: true,
      _dirty: true,
      _value: undefined,
      effect: { deps: [] },
      fn() {
        throw new Error('getter should not run')
      },
    }
    const accessedThenDirty = {
      __v_isRef: true,
      _dirty: true,
      _value: 4,
      effect: { deps: [{}] },
      fn() {
        throw new Error('getter should not run')
      },
    }

    expect(encodeValue(neverRun)).toMatchObject({
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      kind: 'custom',
    })
    expect(encodeValue(accessedThenDirty)).toEqual({ kind: 'number', value: 4 })
  })

  it('does not mistake a Vue 3.6 ref with flags for a computed', () => {
    const value = {
      __v_isRef: true,
      _value: 'ready',
      flags: 1,
    }

    expect(isComputedRef(value)).toBe(false)
    expect(isUnaccessedComputed(value)).toBe(false)
  })

  it('uses Vue 3.6 dirty state before the Vue 3.5 evaluated flag', () => {
    const neverRun = {
      __v_isRef: true,
      _dirty: true,
      _value: undefined,
      deps: undefined,
      effect: {},
      flags: 17,
      fn() {
        throw new Error('getter should not run')
      },
    }
    const accessed = {
      ...neverRun,
      _dirty: false,
      flags: 1,
    }
    const accessedThenDirty = {
      ...neverRun,
      _value: 4,
      deps: {},
      flags: 33,
    }

    expect(isUnaccessedComputed(neverRun)).toBe(true)
    expect(isUnaccessedComputed(accessed)).toBe(false)
    expect(isUnaccessedComputed(accessedThenDirty)).toBe(false)
    expect(encodeValue(accessedThenDirty)).toEqual({ kind: 'number', value: 4 })
  })
})

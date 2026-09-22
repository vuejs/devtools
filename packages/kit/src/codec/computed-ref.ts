/**
 * Vue 3.5 `EffectFlags.EVALUATED`. Used instead of importing Vue private
 * enums so this stays compatible across 3.4 (`_dirty`) and 3.5 (`flags`).
 */
const COMPUTED_EVALUATED_FLAG = 1 << 7

export const NOT_ACCESSED_COMPUTED_TYPE = 'computed-not-accessed'
export const NOT_ACCESSED_COMPUTED_DISPLAY = 'not accessed'
export const NOT_ACCESSED_COMPUTED_TOOLTIP = 'This computed property has never been accessed.'

export function createNotAccessedComputedCustomValue(): {
  _custom: {
    type: string
    display: string
    tooltip: string
    abstract: true
    readOnly: true
    value: undefined
  }
} {
  return {
    _custom: {
      type: NOT_ACCESSED_COMPUTED_TYPE,
      display: NOT_ACCESSED_COMPUTED_DISPLAY,
      tooltip: NOT_ACCESSED_COMPUTED_TOOLTIP,
      abstract: true,
      readOnly: true,
      value: undefined,
    },
  }
}

interface ComputedRefLike {
  __v_isRef: true
  _value?: unknown
  flags?: unknown
  _dirty?: unknown
  deps?: unknown
  effect?: { deps?: unknown }
  fn?: unknown
}

export function isComputedRef(value: unknown): value is ComputedRefLike {
  if (value == null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.__v_isRef !== true) return false
  return (
    record.effect != null || typeof record.fn === 'function' || typeof record._dirty === 'boolean'
  )
}

export function isUnaccessedComputed(value: unknown): boolean {
  if (!isComputedRef(value)) return false

  // Vue 3.4 and 3.6 expose `_dirty`; check it before the Vue 3.5 flags.
  // Vue 3.6 gives plain refs numeric flags too, so flags cannot identify a
  // computed and its bit layout cannot be interpreted as Vue 3.5's layout.
  if (typeof value._dirty === 'boolean') {
    if (!value._dirty) return false

    const deps = value.effect?.deps ?? value.deps
    if (Array.isArray(deps)) return deps.length === 0
    return deps == null
  }

  return typeof value.flags === 'number' && (value.flags & COMPUTED_EVALUATED_FLAG) === 0
}

export function readCachedComputedValue(value: ComputedRefLike): unknown {
  if (Object.prototype.hasOwnProperty.call(value, '_value')) return value._value
  return undefined
}

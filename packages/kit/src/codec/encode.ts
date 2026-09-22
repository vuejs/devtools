import type { ComponentId } from '../runtime'
import type { ValueHandle } from './handles'
import {
  isComputedRef,
  isUnaccessedComputed,
  NOT_ACCESSED_COMPUTED_DISPLAY,
  NOT_ACCESSED_COMPUTED_TOOLTIP,
  NOT_ACCESSED_COMPUTED_TYPE,
  readCachedComputedValue,
} from './computed-ref'
import { ValueHandleRegistry } from './handles'

export interface ValueEntry {
  key: string
  value: EncodedValue
}

export type EncodedValue =
  | { kind: 'null' | 'undefined' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number | 'NaN' | 'Infinity' | '-Infinity' }
  | { kind: 'string'; value: string; truncated?: boolean; length?: number }
  | { kind: 'bigint'; value: string }
  | { kind: 'symbol'; description: string }
  | { kind: 'function'; name?: string; sourcePreview?: string }
  | { kind: 'array'; length: number; preview: ValueEntry[]; handle?: ValueHandle }
  | { kind: 'object'; name: string; entries: number; preview: ValueEntry[]; handle?: ValueHandle }
  | { kind: 'map' | 'set'; size: number; preview: ValueEntry[]; handle?: ValueHandle }
  | { kind: 'component'; id?: ComponentId; name: string }
  | { kind: 'dom'; tag: string; id?: string; className?: string }
  | {
      kind: 'custom'
      type?: string
      display?: string
      tooltip?: string
      value: EncodedValue
      handle?: ValueHandle
      file?: string
      abstract?: boolean
      readOnly?: boolean
      actions?: { icon?: string; tooltip?: string }[]
      fields?: Record<string, unknown>
    }
  | { kind: 'date'; value: string }
  | { kind: 'regexp'; value: string }
  | { kind: 'error'; name: string; message: string; stack?: string }
  | { kind: 'circular'; handle: ValueHandle }

export interface ValueCodecOptions {
  maxDepth?: number
  maxEntries?: number
  maxStringLength?: number
  handles?: ValueHandleRegistry
  /** Handle scope used for lifecycle release (e.g. `component:<id>`). */
  handleScope?: string
}

interface EncodeState {
  depth: number
  seen: WeakMap<object, ValueHandle>
  handles: ValueHandleRegistry
  handleScope?: string
  maxDepth: number
  maxEntries: number
  maxStringLength: number
}

export function encodeValue(value: unknown, options: ValueCodecOptions = {}): EncodedValue {
  const handles = options.handles ?? new ValueHandleRegistry()
  return encode(value, {
    depth: 0,
    seen: new WeakMap(),
    handles,
    handleScope: options.handleScope,
    maxDepth: options.maxDepth ?? 2,
    maxEntries: options.maxEntries ?? 50,
    maxStringLength: options.maxStringLength ?? 10_000,
  })
}

/**
 * Encoding never throws: any failure (hostile Proxy traps, throwing getters,
 * exotic objects) degrades to a single `error` field instead of failing the
 * whole state query.
 */
function encode(value: unknown, state: EncodeState): EncodedValue {
  try {
    return encodeUnsafe(value, state)
  } catch (error) {
    return toSerializationFailure(error)
  }
}

function encodeUnsafe(value: unknown, state: EncodeState): EncodedValue {
  if (value === null) return { kind: 'null' }

  if (typeof value === 'undefined') return { kind: 'undefined' }

  if (typeof value === 'boolean') return { kind: 'boolean', value }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { kind: 'number', value: 'NaN' }
    if (value === Number.POSITIVE_INFINITY) return { kind: 'number', value: 'Infinity' }
    if (value === Number.NEGATIVE_INFINITY) return { kind: 'number', value: '-Infinity' }
    return { kind: 'number', value }
  }

  if (typeof value === 'string') return encodeString(value, state)

  if (typeof value === 'bigint') return { kind: 'bigint', value: value.toString() }

  if (typeof value === 'symbol')
    return { kind: 'symbol', description: value.description ?? value.toString() }

  if (typeof value === 'function')
    return {
      kind: 'function',
      name: value.name || undefined,
      sourcePreview: previewSource(value, state),
    }

  if (typeof value !== 'object')
    return { kind: 'string', value: Object.prototype.toString.call(value) }

  if (isComputedRef(value)) {
    if (isUnaccessedComputed(value)) return encodeUnaccessedComputedValue()
    return encode(readCachedComputedValue(value), state)
  }

  const circular = state.seen.get(value)
  if (circular) return { kind: 'circular', handle: circular }

  const handle = state.handles.getOrCreate(value, state.handleScope)
  state.seen.set(value, handle)

  if (isCustomValue(value)) return encodeCustomValue(value, handle, state)

  if (isDomElement(value)) return encodeDomElement(value)

  if (isComponentInstanceLike(value)) return encodeComponentInstance(value)

  if (value instanceof Date) return encodeDate(value)

  if (value instanceof RegExp) return { kind: 'regexp', value: value.toString() }

  if (value instanceof Error)
    return { kind: 'error', name: value.name, message: value.message, stack: value.stack }

  if (Array.isArray(value)) {
    return {
      kind: 'array',
      length: value.length,
      preview:
        state.depth >= state.maxDepth
          ? []
          : value.slice(0, state.maxEntries).map((item, index) => ({
              key: String(index),
              value: encode(item, nextState(state)),
            })),
      handle,
    }
  }

  if (value instanceof Map) return encodeMap(value, handle, state)

  if (value instanceof Set) return encodeSet(value, handle, state)

  return encodeObject(value, handle, state)
}

function encodeObject(value: object, handle: ValueHandle, state: EncodeState): EncodedValue {
  const keys = safeOwnEnumerableStringKeys(value)
  const previewKeys = keys.slice(0, state.maxEntries)
  return {
    kind: 'object',
    name: getObjectName(value),
    entries: keys.length,
    preview:
      state.depth >= state.maxDepth
        ? []
        : previewKeys.map((key) => ({
            key,
            value: encodeOwnProperty(value, key, nextState(state)),
          })),
    handle,
  }
}

function encodeMap(
  value: Map<unknown, unknown>,
  handle: ValueHandle,
  state: EncodeState,
): EncodedValue {
  const preview: ValueEntry[] = []
  let size = 0
  try {
    size = value.size
    if (state.depth < state.maxDepth) {
      let index = 0
      for (const [key, item] of value) {
        if (index >= state.maxEntries) break
        preview.push({
          key: formatPreviewKey(key),
          value: encode(item, nextState(state)),
        })
        index++
      }
    }
  } catch {
    // Subclasses can override size/iteration; keep whatever was collected.
  }
  return { kind: 'map', size, preview, handle }
}

function encodeSet(value: Set<unknown>, handle: ValueHandle, state: EncodeState): EncodedValue {
  const preview: ValueEntry[] = []
  let size = 0
  try {
    size = value.size
    if (state.depth < state.maxDepth) {
      let index = 0
      for (const item of value) {
        if (index >= state.maxEntries) break
        preview.push({
          key: String(index),
          value: encode(item, nextState(state)),
        })
        index++
      }
    }
  } catch {
    // Subclasses can override size/iteration; keep whatever was collected.
  }
  return { kind: 'set', size, preview, handle }
}

/**
 * Reads one own property for preview. Data properties are read from the
 * descriptor; own accessor getters are invoked (they are what the object
 * chose to expose), but a throwing getter degrades only this field.
 * Prototype accessors (DOM/EventTarget internals) are never touched.
 */
function encodeOwnProperty(target: object, key: string, state: EncodeState): EncodedValue {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor && !('value' in descriptor)) {
      if (typeof descriptor.get !== 'function') return { kind: 'undefined' }
      return encode(descriptor.get.call(target), state)
    }
    // Read through the object (not the descriptor) so Proxy-based reactive
    // values report their current value.
    return encode((target as Record<string, unknown>)[key], state)
  } catch (error) {
    return toSerializationFailure(error)
  }
}

function safeOwnEnumerableStringKeys(value: object): string[] {
  try {
    const keys: string[] = []
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') continue
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor?.enumerable) keys.push(key)
      } catch {
        // Skip keys whose descriptor cannot be read (hostile Proxy traps).
      }
    }
    return keys
  } catch {
    return []
  }
}

function toSerializationFailure(error: unknown): EncodedValue {
  if (error instanceof Error) {
    return { kind: 'error', name: error.name || 'Error', message: error.message }
  }
  return { kind: 'error', name: 'Error', message: safeString(error) }
}

function safeString(value: unknown): string {
  try {
    return String(value)
  } catch {
    return 'Unserializable value'
  }
}

function encodeDate(value: Date): EncodedValue {
  try {
    return { kind: 'date', value: value.toISOString() }
  } catch {
    return { kind: 'date', value: String(value) }
  }
}

function encodeUnaccessedComputedValue(): EncodedValue {
  return {
    kind: 'custom',
    type: NOT_ACCESSED_COMPUTED_TYPE,
    display: NOT_ACCESSED_COMPUTED_DISPLAY,
    tooltip: NOT_ACCESSED_COMPUTED_TOOLTIP,
    abstract: true,
    readOnly: true,
    value: { kind: 'undefined' },
  }
}

function encodeCustomValue(value: object, handle: ValueHandle, state: EncodeState): EncodedValue {
  const custom = (value as { _custom: Record<string, unknown> })._custom
  const rawValue = Object.prototype.hasOwnProperty.call(custom, 'value')
    ? custom.value
    : custom.display

  return {
    kind: 'custom',
    type: readString(custom, 'type'),
    display: readString(custom, 'display'),
    tooltip: readString(custom, 'tooltip'),
    value: encode(rawValue, nextState(state)),
    handle,
    file: readString(custom, 'file'),
    abstract: readBoolean(custom, 'abstract'),
    readOnly: readBoolean(custom, 'readOnly'),
    actions: readActions(custom),
    fields: readRecord(custom, 'fields'),
  }
}

function encodeString(value: string, state: EncodeState): EncodedValue {
  if (value.length <= state.maxStringLength) return { kind: 'string', value }

  return {
    kind: 'string',
    value: value.slice(0, state.maxStringLength),
    truncated: true,
    length: value.length,
  }
}

function encodeDomElement(value: Element): EncodedValue {
  return {
    kind: 'dom',
    tag: value.tagName.toLowerCase(),
    id: value.id || undefined,
    className: typeof value.className === 'string' && value.className ? value.className : undefined,
  }
}

function encodeComponentInstance(value: object): EncodedValue {
  const record = value as Record<string, unknown>
  const id =
    typeof record.__VUE_DEVTOOLS_UID__ === 'string' ? record.__VUE_DEVTOOLS_UID__ : undefined
  const type =
    record.type != null && typeof record.type === 'object'
      ? (record.type as Record<string, unknown>)
      : undefined
  const name = type && typeof type.name === 'string' ? type.name : 'Component'
  return { kind: 'component', id, name }
}

function isCustomValue(value: object): value is { _custom: Record<string, unknown> } {
  const custom = (value as { _custom?: unknown })._custom
  return custom != null && typeof custom === 'object'
}

function nextState(state: EncodeState): EncodeState {
  return {
    ...state,
    depth: state.depth + 1,
  }
}

function previewSource(value: Function, state: EncodeState): string | undefined {
  try {
    const encoded = encodeString(value.toString(), state)
    return encoded.kind === 'string' ? encoded.value : undefined
  } catch {
    return
  }
}

export function formatPreviewKey(value: unknown): string {
  try {
    if (value == null) return String(value)
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return String(value)
    if (typeof value === 'symbol') return value.description ?? value.toString()
    return getObjectName(value)
  } catch {
    return 'unknown'
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key]
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readActions(
  record: Record<string, unknown>,
): { icon?: string; tooltip?: string }[] | undefined {
  const actions = record.actions
  if (!Array.isArray(actions)) return

  return actions
    .filter(
      (action): action is Record<string, unknown> => action != null && typeof action === 'object',
    )
    .map((action) => ({
      icon: readString(action, 'icon'),
      tooltip: readString(action, 'tooltip'),
    }))
}

function getObjectName(value: unknown): string {
  if (value == null) return 'Object'
  try {
    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name
    return constructorName && constructorName !== 'Object' ? constructorName : 'Object'
  } catch {
    return 'Object'
  }
}

function isDomElement(value: object): value is Element {
  return typeof Element !== 'undefined' && value instanceof Element
}

function isComponentInstanceLike(value: object): boolean {
  const record = value as Record<string, unknown>
  return typeof record.uid === 'number' && record.type != null && typeof record.type === 'object'
}

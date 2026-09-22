import type { ComponentStateSection } from '../../protocol'
import type { InstanceRef } from '../types'
import {
  readObject,
  hasOwn,
  readObjectValue,
  isRef,
  readUnknownProperty,
  readBoolean,
} from './shared'
import {
  resolveMergedOptions,
  collectSetupBindings,
  isUserSetupKey,
  getSetupStateType,
} from './instance'
import { createComputedReader, readComputedSource } from './computed'
import { isComputedRef } from '../../codec'

type SectionId = ComponentStateSection['id']

export interface SectionSource {
  id: SectionId
  label: string
  source: object | undefined
  editable: boolean | ((key: string) => boolean)
  meta?: (key: string) => Record<string, unknown> | undefined
}

export function createSectionSources(instance: InstanceRef): SectionSource[] {
  const record = instance as Record<string, unknown>
  const type = readObject(record, 'type')
  const mergedType = resolveMergedOptions(instance)
  const proxy = readObject(record, 'proxy')
  const computed = readObject(mergedType, 'computed')
  const rawSetupState = collectSetupBindings(record)
  const setupState = createSetupStateReaders(rawSetupState)

  return [
    {
      id: 'props',
      label: 'Props',
      source: readObject(record, 'props'),
      editable: true,
      meta: createPropMetaReader(type),
    },
    {
      id: 'data',
      label: 'Data',
      source: createDataReader(record, mergedType),
      editable: true,
    },
    {
      id: 'setup',
      label: 'Setup',
      source: setupState.state,
      editable: true,
      meta: createSetupStateMetaReader(rawSetupState),
    },
    {
      id: 'setup-other',
      label: 'Setup (other)',
      source: setupState.other,
      editable: false,
      meta: createSetupStateMetaReader(rawSetupState),
    },
    {
      id: 'computed',
      label: 'Computed',
      source: computed ? createComputedReader(computed, proxy, record) : undefined,
      editable: true,
      meta: createComputedMetaReader(computed),
    },
    {
      id: 'attrs',
      label: 'Attrs',
      source: readObject(record, 'attrs'),
      editable: false,
    },
    {
      id: 'provide',
      label: 'Provided',
      source: readObject(record, 'provides'),
      editable: false,
    },
    {
      id: 'inject',
      label: 'Injected',
      source: createInjectReader(record, mergedType),
      editable: false,
    },
    {
      id: 'refs',
      label: 'Refs',
      source: readObject(record, 'refs'),
      editable: false,
    },
    {
      id: 'listeners',
      label: 'Listeners',
      source: createListenerReader(readObject(readObject(record, 'vnode'), 'props'), type),
      editable: false,
    },
  ]
}

function createDataReader(
  record: Record<string, unknown>,
  type: object | undefined,
): object | undefined {
  const props = readObject(type, 'props')
  const computed = readObject(type, 'computed')
  const vuex = readObject(type, 'vuex')
  const getters = readObject(vuex, 'getters')
  const data = mergeObjects(readObject(record, 'data'), readObject(record, 'renderContext'))
  if (!data) return

  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(data)) {
    if (typeof key !== 'string') continue
    if (
      (props && hasOwn(props, key)) ||
      (computed && hasOwn(computed, key)) ||
      (getters && hasOwn(getters, key))
    )
      continue
    result[key] = readObjectValue(data, key)
  }
  return result
}

function createSetupStateReaders(rawSetupState: object | undefined): {
  state: object | undefined
  other: object | undefined
} {
  if (!rawSetupState) return { state: undefined, other: undefined }

  const state: Record<string, unknown> = {}
  const other: Record<string, unknown> = {}

  for (const key of Object.keys(rawSetupState)) {
    if (!isUserSetupKey(key)) continue

    const rawValue = readObjectValue(rawSetupState, key)
    const value = isComputedRef(rawValue) ? rawValue : unwrapSetupDisplayValue(rawValue)
    const target = isOtherSetupValue(key, value, rawValue) ? other : state
    target[key] = value
  }

  return {
    state: Object.keys(state).length ? state : undefined,
    other: Object.keys(other).length ? other : undefined,
  }
}

function unwrapSetupDisplayValue(value: unknown): unknown {
  return isRef(value) ? readUnknownProperty(value as object, 'value') : value
}

function isOtherSetupValue(key: string, value: unknown, rawValue: unknown): boolean {
  const info = getSetupStateType(rawValue)
  if (info.ref || info.computed || info.reactive) return false

  return (
    typeof value === 'function' ||
    (value != null &&
      typeof value === 'object' &&
      (typeof readUnknownProperty(value, 'render') === 'function' ||
        typeof readUnknownProperty(value, '__asyncLoader') === 'function' ||
        readUnknownProperty(value, 'setup') != null ||
        readUnknownProperty(value, 'props') != null)) ||
    /^v[A-Z]/.test(key)
  )
}

function createComputedMetaReader(
  computed: object | undefined,
): ((key: string) => Record<string, unknown> | undefined) | undefined {
  if (!computed) return

  return (key) => {
    const definition = readObjectValue(computed, key)
    return {
      editable:
        definition != null &&
        typeof definition === 'object' &&
        typeof readUnknownProperty(definition, 'set') === 'function',
    }
  }
}

function createSetupStateMetaReader(
  rawSetupState: object | undefined,
): ((key: string) => Record<string, unknown> | undefined) | undefined {
  if (!rawSetupState) return

  return (key) => {
    const rawValue = readObjectValue(rawSetupState, key)
    const info = getSetupStateType(rawValue)
    const stateType = info.computed
      ? 'computed'
      : info.ref
        ? 'ref'
        : info.reactive
          ? 'reactive'
          : undefined
    if (!stateType) return

    const meta: Record<string, unknown> = {
      stateType,
      stateTypeName: capitalize(stateType),
      readonly: info.readonly,
    }
    const raw = readComputedSource(rawValue)
    if (raw) meta.raw = raw
    return meta
  }
}

export function resolveEntryEditable(
  editable: boolean | ((key: string) => boolean),
  meta: Record<string, unknown> | undefined,
  key: string,
): boolean {
  if (typeof meta?.editable === 'boolean') return meta.editable
  if (typeof editable === 'function') return editable(key)
  if (!editable) return false
  if (meta?.readonly === true) return false
  return meta?.stateType !== 'computed'
}

function createInjectReader(
  record: Record<string, unknown>,
  type: object | undefined,
): object | undefined {
  const inject = readUnknownProperty(type ?? {}, 'inject')
  if (!inject) return

  const ctx = readObject(record, 'ctx')
  const result: Record<string, unknown> = {}

  for (const item of normalizeInjectOptions(inject)) {
    const label =
      item.originalKey != null && item.key !== item.originalKey
        ? `${stringifyStateKey(item.originalKey)} -> ${stringifyStateKey(item.key)}`
        : stringifyStateKey(item.key)
    if (!label) continue

    result[label] = ctx && hasOwn(ctx, item.key) ? readObjectValue(ctx, item.key) : undefined
  }

  return Object.keys(result).length ? result : undefined
}

function normalizeInjectOptions(
  inject: unknown,
): { key: PropertyKey; originalKey?: PropertyKey }[] {
  if (Array.isArray(inject)) {
    return inject
      .filter((key): key is string | symbol => typeof key === 'string' || typeof key === 'symbol')
      .map((key) => ({ key, originalKey: key }))
  }

  if (inject == null || typeof inject !== 'object') return []

  return Reflect.ownKeys(inject).map((key) => {
    const value = readObjectValue(inject, key)
    if (typeof value === 'string' || typeof value === 'symbol') {
      return { key, originalKey: value }
    }
    if (value != null && typeof value === 'object') {
      const from = readUnknownProperty(value, 'from')
      return {
        key,
        originalKey: typeof from === 'string' || typeof from === 'symbol' ? from : key,
      }
    }
    return { key, originalKey: key }
  })
}

function createListenerReader(
  vnodeProps: object | undefined,
  type: object | undefined,
): object | undefined {
  if (!vnodeProps) return

  const declared = readDeclaredEmits(type)
  const listeners: Record<string, unknown> = {}

  for (const key of Object.keys(vnodeProps)) {
    if (!key.startsWith('on') || key.length <= 2) continue
    const event = key
      .slice(2)
      .replace(/([A-Z])/g, '-$1')
      .replace(/^-/, '')
      .toLowerCase()
    const declaredEvent = declared.has(event)
    listeners[event] = {
      _custom: {
        display: declaredEvent ? 'Declared' : 'Not declared',
        tooltip: declaredEvent
          ? undefined
          : `The event <code>${event}</code> is not declared in the <code>emits</code> option. It will leak into the component attrs.`,
        value: { declared: declaredEvent },
      },
    }
  }

  return listeners
}

function createPropMetaReader(
  type: object | undefined,
): ((key: string) => Record<string, unknown> | undefined) | undefined {
  const props = readObject(type, 'props')
  if (!props) return

  return (key) => {
    const definition = readObject(props, key)
    if (!definition) return { type: 'unknown' }

    return {
      required: readBoolean(definition, 'required') ?? false,
      type: readPropType(definition),
      hasDefault: Object.prototype.hasOwnProperty.call(definition, 'default'),
    }
  }
}

function readDeclaredEmits(type: object | undefined): Set<string> {
  const emits = type ? (type as Record<string, unknown>).emits : undefined
  if (Array.isArray(emits)) return new Set(emits.filter((value) => typeof value === 'string'))
  if (emits && typeof emits === 'object') return new Set(Object.keys(emits))
  return new Set()
}

function readPropType(definition: object): string {
  const type = (definition as Record<string, unknown>).type
  if (typeof type === 'function') return type.name || 'anonymous'
  if (Array.isArray(type)) {
    return type
      .map((item) => (typeof item === 'function' ? item.name || 'anonymous' : typeof item))
      .join(' | ')
  }
  return 'any'
}

function mergeObjects(...objects: Array<object | undefined>): object | undefined {
  const result: Record<string, unknown> = {}
  let hasValue = false

  for (const object of objects) {
    if (!object) continue
    Object.assign(result, object)
    hasValue = true
  }

  return hasValue ? result : undefined
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function stringifyStateKey(key: PropertyKey): string {
  return typeof key === 'symbol' ? key.toString() : String(key)
}

export function toSectionLabel(sectionId: string): string {
  return sectionId
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

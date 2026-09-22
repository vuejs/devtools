import type { InstanceRef } from '../types'
import { readObject, hasOwn, toRaw, isRef, isReactive } from './shared'
import { formatPreviewKey } from '../../codec/encode'
import { findSetupEditTarget } from './instance'

export function getEditableSectionTarget(
  instance: InstanceRef,
  sectionId: string,
  key: string | undefined,
): object | undefined {
  const record = instance as Record<string, unknown>

  switch (sectionId) {
    case 'props':
      return readObject(record, 'props')
    case 'data':
      return findDataEditTarget(record, key)
    case 'setup':
      return findSetupEditTarget(record, key)
    case 'computed':
      return readObject(record, 'proxy')
    default:
      return
  }
}

function findDataEditTarget(
  record: Record<string, unknown>,
  key: string | undefined,
): object | undefined {
  const data = readObject(record, 'data')
  if (data && (!key || hasOwn(data, key))) return data

  const renderContext = readObject(record, 'renderContext')
  if (renderContext && (!key || hasOwn(renderContext, key))) return renderContext

  return readObject(record, 'proxy')
}

export function setStateValue(
  target: object,
  path: string[],
  value: unknown,
  newKey?: string,
): boolean {
  let object: unknown = target

  for (const segment of path.slice(0, -1)) {
    object = unwrapEditableValue(readEditableValue(unwrapEditableValue(object), segment))
    if (object == null || (typeof object !== 'object' && typeof object !== 'function')) return false
  }

  const field = path.at(-1)
  if (field === undefined) return false
  const unwrapped = unwrapEditableValue(object)
  if (!resolveEditableValue(unwrapped, field).found) return false
  if (newKey && newKey !== field) {
    const raw = toRaw(unwrapped)
    if (Array.isArray(raw) || raw instanceof Set) return false
    if (raw instanceof Map ? raw.has(newKey) : hasOwn(unwrapped as object, newKey)) return false
  }
  const written = writeEditableValue(unwrapped, field, value)
  if (!written || !newKey || newKey === field) return written
  return renameEditableValue(unwrapped, field, newKey)
}

export function deleteStateValue(target: object, path: string[]): boolean {
  let object: unknown = target

  for (const segment of path.slice(0, -1)) {
    object = unwrapEditableValue(readEditableValue(unwrapEditableValue(object), segment))
    if (object == null || (typeof object !== 'object' && typeof object !== 'function')) return false
  }

  const field = path.at(-1)
  if (field === undefined) return false
  if (!resolveEditableValue(unwrapEditableValue(object), field).found) return false
  return deleteEditableValue(unwrapEditableValue(object), field)
}

export function addStateValue(target: object, path: string[], value: unknown): boolean {
  let object: unknown = target

  for (const segment of path) {
    object = unwrapEditableValue(readEditableValue(unwrapEditableValue(object), segment))
    if (object == null || (typeof object !== 'object' && typeof object !== 'function')) return false
  }

  return addEditableValue(unwrapEditableValue(object), value)
}

function resolveMapKey(
  target: Map<unknown, unknown>,
  field: string,
): { found: boolean; key?: unknown } {
  let result: { found: boolean; key?: unknown } = { found: false }
  for (const key of target.keys()) {
    if (formatPreviewKey(key) !== field) continue
    if (result.found) return { found: false }
    result = { found: true, key }
  }
  return result
}

function resolveEditableValue(target: unknown, field: string): { found: boolean; value?: unknown } {
  const rawTarget = toRaw(target)
  if (rawTarget instanceof Map) {
    const key = resolveMapKey(rawTarget, field)
    return key.found
      ? { found: true, value: (target as Map<unknown, unknown>).get(key.key) }
      : { found: false }
  }
  if (rawTarget instanceof Set) {
    const index = Number(field)
    return field !== '' && Number.isInteger(index) && index >= 0 && index < rawTarget.size
      ? { found: true, value: Array.from((target as Set<unknown>).values())[index] }
      : { found: false }
  }
  return target != null &&
    (typeof target === 'object' || typeof target === 'function') &&
    hasOwn(target, field)
    ? { found: true, value: (target as Record<string, unknown>)[field] }
    : { found: false }
}

function readEditableValue(target: unknown, field: string): unknown {
  return resolveEditableValue(target, field).value
}

function writeEditableValue(target: unknown, field: string, value: unknown): boolean {
  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) return false

  const rawTarget = toRaw(target)
  if (rawTarget instanceof Map) {
    const key = resolveMapKey(rawTarget, field)
    if (!key.found) return false
    ;(target as Map<unknown, unknown>).set(key.key, value)
    return true
  }

  if (rawTarget instanceof Set) {
    const index = Number(field)
    if (!Number.isInteger(index)) return false

    const values = Array.from(rawTarget.values())
    if (index < 0 || index >= values.length) return false
    const collection = target as Set<unknown>
    collection.clear()
    values.forEach((item, itemIndex) => collection.add(itemIndex === index ? value : item))
    return true
  }

  const record = target as Record<string, unknown>
  const current = record[field]
  if (isRef(current)) {
    const refValue = current as { value: unknown }
    refValue.value = value
    return true
  }

  if (shouldPatchReactiveObject(current, value)) {
    patchReactiveObject(current as Record<string, unknown>, value as Record<string, unknown>)
    return true
  }

  record[field] = value
  return true
}

function deleteEditableValue(target: unknown, field: string): boolean {
  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) return false

  if (Array.isArray(target)) {
    const index = Number(field)
    if (!Number.isInteger(index) || index < 0 || index >= target.length) return false
    target.splice(index, 1)
    return true
  }

  const rawTarget = toRaw(target)
  if (rawTarget instanceof Map) {
    const key = resolveMapKey(rawTarget, field)
    return key.found && (target as Map<unknown, unknown>).delete(key.key)
  }

  if (rawTarget instanceof Set) {
    const index = Number(field)
    if (!Number.isInteger(index)) return false

    const values = Array.from(rawTarget.values())
    if (index < 0 || index >= values.length) return false
    return (target as Set<unknown>).delete(values[index])
  }

  return Reflect.deleteProperty(target, field)
}

function renameEditableValue(target: unknown, previousField: string, nextField: string): boolean {
  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) return false

  const rawTarget = toRaw(target)
  if (rawTarget instanceof Map) {
    const key = resolveMapKey(rawTarget, previousField)
    if (!key.found || rawTarget.has(nextField)) return false
    const collection = target as Map<unknown, unknown>
    const value = collection.get(key.key)
    collection.delete(key.key)
    collection.set(nextField, value)
    return true
  }

  if (Array.isArray(target) || rawTarget instanceof Set || hasOwn(target, nextField)) return false

  const record = target as Record<string, unknown>
  record[nextField] = record[previousField]
  Reflect.deleteProperty(record, previousField)
  return true
}

function addEditableValue(target: unknown, value: unknown): boolean {
  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) return false

  if (Array.isArray(target)) {
    target.push(value)
    return true
  }

  const rawTarget = toRaw(target)
  if (rawTarget instanceof Map) {
    ;(target as Map<unknown, unknown>).set(getNextAvailableMapKey(rawTarget), value)
    return true
  }

  if (rawTarget instanceof Set) {
    ;(target as Set<unknown>).add(value)
    return true
  }

  Reflect.set(target, getNextAvailableObjectKey(target), value)
  return true
}

function shouldPatchReactiveObject(current: unknown, value: unknown): boolean {
  return (
    isReactive(current) &&
    isPlainEditableObject(current) &&
    isPlainEditableObject(value) &&
    Array.isArray(current) === Array.isArray(value)
  )
}

function patchReactiveObject(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
): void {
  const nextKeys = new Set(Object.keys(value))

  for (const key of Object.keys(target)) {
    if (!nextKeys.has(key)) Reflect.deleteProperty(target, key)
  }

  for (const key of nextKeys) {
    Reflect.set(target, key, value[key])
  }
  if (Array.isArray(target) && Array.isArray(value)) target.length = value.length
}

function unwrapEditableValue(value: unknown): unknown {
  return isRef(value) ? (value as { value: unknown }).value : value
}

function isPlainEditableObject(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false
  if (Array.isArray(value)) return true
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function readPath(root: object, path: string[]): unknown {
  return resolvePath(root, path).value
}

export function resolvePath(root: object, path: string[]): { found: boolean; value?: unknown } {
  let current: unknown = root

  for (const segment of path) {
    const result = resolveEditableValue(unwrapEditableValue(current), segment)
    if (!result.found) return { found: false }
    current = result.value
  }

  return { found: true, value: current }
}

function getNextAvailableObjectKey(target: object): string {
  for (let i = 1; ; i++) {
    const key = `newProp${i}`
    if (!hasOwn(target, key)) return key
  }
}

function getNextAvailableMapKey(target: Map<unknown, unknown>): string {
  for (let i = 1; ; i++) {
    const key = `newProp${i}`
    if (!target.has(key)) return key
  }
}

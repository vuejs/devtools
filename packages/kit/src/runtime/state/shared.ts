export type TraceObject = Record<PropertyKey, unknown>

export interface DependencyLink {
  dep?: TraceObject
  sub?: TraceObject
  nextDep?: DependencyLink
  nextSub?: DependencyLink
}

export function asDependencyLink(value: unknown): DependencyLink | undefined {
  return asTraceObject(value) as DependencyLink | undefined
}

export function asTraceObject(value: unknown): TraceObject | undefined {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? (value as TraceObject)
    : undefined
}

export function isRef(value: unknown): boolean {
  return value != null && typeof value === 'object' && readBoolean(value, '__v_isRef') === true
}

export function isReactive(value: unknown): boolean {
  return value != null && typeof value === 'object' && readBoolean(value, '__v_isReactive') === true
}

export function toRaw(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  const raw = readUnknownProperty(value, '__v_raw')
  return raw != null && typeof raw === 'object' ? raw : value
}

export function readObjectValue(target: object, key: PropertyKey): unknown {
  try {
    return (target as Record<PropertyKey, unknown>)[key]
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

export function readObject(target: object | undefined, key: string): object | undefined {
  if (!target) return
  const value = readUnknownProperty(target, key)
  return value != null && typeof value === 'object' ? value : undefined
}

export function readBoolean(target: object, key: string): boolean | undefined {
  const value = readUnknownProperty(target, key)
  return typeof value === 'boolean' ? value : undefined
}

export function readUnknownProperty(target: object, key: string): unknown {
  return (target as Record<string, unknown>)[key]
}

export function readStringProperty(target: object | undefined, key: string): string | undefined {
  if (!target) return
  const value = readUnknownProperty(target, key)
  return typeof value === 'string' ? value : undefined
}

export function hasOwn(target: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

export function safeOwnKeys(target: object): PropertyKey[] {
  try {
    return Reflect.ownKeys(target)
  } catch {
    return []
  }
}

import type {
  ReactivityGraphNodeType,
  ReactivityGraphSnapshot,
  ReactivityGraphNode,
  ReactivityRelationship,
} from '../../protocol'
import type { InstanceRef } from '../types'
import { collectSetupBindings, isUserSetupKey, getSetupStateType } from './instance'
import {
  readObjectValue,
  asTraceObject,
  readUnknownProperty,
  readObject,
  asDependencyLink,
  hasOwn,
  readStringProperty,
} from './shared'
import type { TraceObject, DependencyLink } from './shared'

interface ReactivityDependency {
  type: ReactivityGraphNodeType
  reference: object
  data: Record<string, unknown>
}

interface ReactivitySource {
  key: string
  reference: object
  deps: ReactivityDependency[]
  subs: ReactivityDependency[]
}

export function buildComponentReactivityGraph(
  instance: InstanceRef,
  getId: (reference: object) => string,
): ReactivityGraphSnapshot {
  const record = instance as Record<string, unknown>
  const setupState = collectSetupBindings(record)
  const sources: ReactivitySource[] = []
  const nodes = new Map<object, ReactivityGraphNode>()

  if (!setupState) {
    return {
      nodes: [],
      relationships: [],
    }
  }

  for (const key of Object.keys(setupState)) {
    if (!isUserSetupKey(key)) continue

    const rawValue = readObjectValue(setupState, key)
    const reference = asTraceObject(rawValue)
    if (!reference) continue

    const info = getSetupStateType(rawValue)
    const type = getReactivityStateType(info)
    if (!type) continue

    const deps = collectReactivityDependencies(reference, 'deps')
    const subs = collectReactivityDependencies(reference, 'subs')
    const data = {
      key,
      readonly: info.readonly,
      value: formatReactivityValue(readReactivityValue(reference)),
    }

    upsertReactivityNode(nodes, reference, type, data, getId)
    deps.forEach((dependency) =>
      upsertReactivityNode(nodes, dependency.reference, dependency.type, dependency.data, getId),
    )
    subs.forEach((dependency) =>
      upsertReactivityNode(nodes, dependency.reference, dependency.type, dependency.data, getId),
    )

    sources.push({
      key,
      reference,
      deps,
      subs,
    })
  }

  const relationships = new Map<string, ReactivityRelationship>()

  for (const source of sources) {
    const sourceNode = nodes.get(source.reference)
    if (!sourceNode) continue

    for (const sub of source.subs) {
      const subNode = nodes.get(sub.reference)
      if (subNode) upsertReactivityRelationship(relationships, sourceNode.id, subNode.id)
    }

    for (const dep of source.deps) {
      const depNode = nodes.get(dep.reference)
      if (depNode) upsertReactivityRelationship(relationships, depNode.id, sourceNode.id)
    }
  }

  return {
    nodes: [...nodes.values()],
    relationships: [...relationships.values()],
  }
}

function upsertReactivityNode(
  nodes: Map<object, ReactivityGraphNode>,
  reference: object,
  type: ReactivityGraphNodeType,
  data: Record<string, unknown>,
  getId: (reference: object) => string,
): void {
  const current = nodes.get(reference)
  const nextData = {
    ...current?.data,
    ...data,
  }

  nodes.set(reference, {
    id: current?.id ?? getId(reference),
    type: current?.type === 'unknown' ? type : (current?.type ?? type),
    label: normalizeReactivityNodeLabel(type, nextData),
    data: nextData,
  })
}

function upsertReactivityRelationship(
  relationships: Map<string, ReactivityRelationship>,
  from: string,
  to: string,
): void {
  if (from === to) return

  const id = `${from}->${to}`
  if (relationships.has(id)) return

  relationships.set(id, {
    id,
    from,
    to,
  })
}

function collectReactivityDependencies(
  source: TraceObject,
  type: 'deps' | 'subs',
): ReactivityDependency[] {
  const dependencies: ReactivityDependency[] = []
  const itemKey = type === 'subs' ? 'sub' : 'dep'
  const nextKey = type === 'subs' ? 'nextSub' : 'nextDep'
  const head = type === 'subs' ? readSubscribersHead(source) : readDepsHead(source)
  const seen = new Set<DependencyLink>()

  for (let link = head; link && !seen.has(link); link = link[nextKey]) {
    seen.add(link)

    const reference = asTraceObject(readUnknownProperty(link, itemKey))
    if (!reference) continue

    const reactivityType = getReactivityType(reference)
    dependencies.push({
      type: reactivityType,
      reference,
      data: createReactivityDependencyData(reference, reactivityType),
    })
  }

  return dependencies
}

function createReactivityDependencyData(
  reference: object,
  type: ReactivityGraphNodeType,
): Record<string, unknown> {
  if (type === 'render') {
    return {
      instanceName: readComponentDisplayName(readObject(reference, 'instance')),
    }
  }

  if (type === 'watch') {
    return {
      cb: readFunctionPreview(readUnknownProperty(reference, 'cb')),
    }
  }

  const depKey = readUnknownProperty(reference, 'key')
  if (getConstructorName(reference) === 'Dep' || depKey !== undefined) {
    return {
      key: formatReactivityKey(depKey),
    }
  }

  return {
    value: formatReactivityValue(readReactivityValue(reference)),
  }
}

function normalizeReactivityNodeLabel(
  type: ReactivityGraphNodeType,
  data: Record<string, unknown>,
): string {
  if (typeof data.key === 'string' && data.key) {
    return type === 'reactive' && !data.key.startsWith('reactive.')
      ? `reactive.${data.key}`
      : data.key
  }

  if (type === 'render' && typeof data.instanceName === 'string') {
    return `${data.instanceName} render`
  }

  return fallbackReactivityNodeLabel(type)
}

function fallbackReactivityNodeLabel(type: ReactivityGraphNodeType): string {
  switch (type) {
    case 'ref':
      return 'Anonymous Ref'
    case 'computed':
      return 'Anonymous Computed'
    case 'reactive':
      return 'Reactive Property'
    case 'watch':
      return 'Anonymous Watch'
    case 'render':
      return 'Anonymous Render'
    case 'effect':
      return 'Anonymous Effect'
    default:
      return 'Unknown'
  }
}

function getReactivityStateType(
  info: ReturnType<typeof getSetupStateType>,
): ReactivityGraphNodeType | undefined {
  if (info.computed) return 'computed'
  if (info.ref) return 'ref'
  if (info.reactive) return 'reactive'
  return undefined
}

function getReactivityType(reference: object): ReactivityGraphNodeType {
  const constructorName = getConstructorName(reference)

  if (constructorName === 'SetupRenderEffect') return 'render'
  if (constructorName === 'RenderWatcherEffect' || constructorName === 'WatcherEffect')
    return 'watch'
  if (constructorName === 'ReactiveEffect') return 'effect'
  if (constructorName === 'Dep') return 'reactive'

  const info = getSetupStateType(reference)
  return getReactivityStateType(info) ?? 'unknown'
}

function getConstructorName(value: unknown): string {
  return asTraceObject(value)?.constructor?.name ?? ''
}

function readSubscribersHead(source: TraceObject): DependencyLink | undefined {
  return (
    asDependencyLink(readUnknownProperty(source, 'subs')) ??
    asDependencyLink(readUnknownProperty(source, '_subs'))
  )
}

function readDepsHead(source: TraceObject): DependencyLink | undefined {
  return asDependencyLink(readUnknownProperty(source, 'deps'))
}

function readReactivityValue(reference: object): unknown {
  const record = reference as TraceObject
  return hasOwn(record, 'value')
    ? readObjectValue(record, 'value')
    : readObjectValue(record, '_value')
}

function readFunctionPreview(value: unknown): string | undefined {
  return typeof value === 'function' ? truncate(value.toString(), 220) : undefined
}

function readComponentDisplayName(instance: object | undefined): string {
  const type = readObject(instance, 'type')
  const name =
    (type && readStringProperty(type, 'name')) ??
    (type && readStringProperty(type, '__name')) ??
    readStringProperty(instance, 'name')
  return name ?? 'Anonymous component'
}

function formatReactivityKey(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol')
    return value.description ? `Symbol(${value.description})` : 'Symbol'
  return 'property'
}

function formatReactivityValue(value: unknown): string {
  if (typeof value === 'undefined') return 'undefined'
  if (value == null) return String(value)
  if (typeof value === 'string') return `"${truncate(value, 80)}"`
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol')
    return value.description ? `Symbol(${value.description})` : 'Symbol'
  if (typeof value === 'function') return value.name ? `fn ${value.name}` : 'function'
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'object') {
    const keys = Reflect.ownKeys(value).slice(0, 3).map(formatReactivityKey)
    return `${value.constructor?.name ?? 'Object'}${keys.length ? ` { ${keys.join(', ')} }` : ''}`
  }

  return Object.prototype.toString.call(value)
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

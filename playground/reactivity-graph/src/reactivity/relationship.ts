import type { ReactiveEffectRunner, WatchSource } from 'vue'
import type { ReactivityGraphLink, ReactivityGraphNode, ReactivityNodeType } from './types'
import { computed, effect, nextTick, ref, shallowRef, stop, watch } from 'vue'

type TraceObject = Record<PropertyKey, unknown>

interface DependencyLink {
  dep?: TraceObject
  sub?: TraceObject
  nextDep?: DependencyLink
  nextSub?: DependencyLink
}

interface NodeMeta {
  id: string
  label: string
  type: ReactivityNodeType
  subtitle?: string
  preview?: () => unknown
  runCount?: () => number
}

interface TraceWatchOptions {
  immediate?: boolean
}

const NODE_LIMIT = 160
const LINK_LIMIT = 360

export function createReactivityGraphTracer() {
  const nodes = shallowRef<ReactivityGraphNode[]>([])
  const links = shallowRef<ReactivityGraphLink[]>([])
  const revision = ref(0)

  const metas = new WeakMap<object, NodeMeta>()
  const objects = new Set<object>()
  const stopHandles: Array<() => void> = []
  const effectRunners: ReactiveEffectRunner[] = []
  let nextId = 1
  let refreshPending = false

  function register(source: unknown, meta: Omit<NodeMeta, 'id'>) {
    const object = asObject(source)
    if (!object) return

    const previous = metas.get(object)
    const next: NodeMeta = {
      ...previous,
      ...meta,
      id: previous?.id ?? `node-${nextId++}`,
    }

    metas.set(object, next)
    objects.add(object)
  }

  function traceRef<T>(label: string, value: T, subtitle?: string) {
    const source = ref(value)
    register(source, {
      label,
      preview: () => source.value,
      subtitle,
      type: 'ref',
    })
    return source
  }

  function traceComputed<T>(label: string, getter: () => T, subtitle?: string) {
    let runs = 0
    const source = computed(() => {
      runs += 1
      return getter()
    })

    register(source, {
      label,
      preview: () => source.value,
      runCount: () => runs,
      subtitle,
      type: 'computed',
    })

    return source
  }

  function traceWatch<T>(
    label: string,
    source: WatchSource<T> | WatchSource<T>[],
    callback: (value: T, previous: T | undefined) => void,
    options: TraceWatchOptions = {},
  ) {
    const candidates = normalizeWatchSources(source)
    const before = new Set(candidates.flatMap((candidate) => collectSubscribers(candidate)))
    let runs = 0

    const handle = watch(
      source as WatchSource<T>,
      (value, previous) => {
        runs += 1
        callback(value as T, previous as T | undefined)
        scheduleRefresh()
      },
      {
        immediate: options.immediate ?? true,
      },
    )

    for (const candidate of candidates) {
      for (const subscriber of collectSubscribers(candidate)) {
        if (!before.has(subscriber) && isWatchConstructor(getConstructorName(subscriber))) {
          register(subscriber, {
            label,
            preview: () => 'watch callback',
            runCount: () => runs,
            subtitle: 'watch() subscriber',
            type: 'watch',
          })
        }
      }
    }

    stopHandles.push(handle)
    scheduleRefresh()
    return handle
  }

  function traceEffect(label: string, fn: () => void, subtitle?: string) {
    return traceEffectNode(label, fn, subtitle, 'effect')
  }

  function traceRender(label: string, fn: () => void, subtitle?: string) {
    return traceEffectNode(label, fn, subtitle, 'render')
  }

  function traceEffectNode(
    label: string,
    fn: () => void,
    subtitle: string | undefined,
    type: 'effect' | 'render',
  ) {
    let runs = 0
    const runner = effect(() => {
      runs += 1
      fn()
      scheduleRefresh()
    })

    const runnerEffect = asObject(runner)?.effect
    register(runnerEffect, {
      label,
      preview: () => 'effect runner',
      runCount: () => runs,
      subtitle,
      type,
    })

    effectRunners.push(runner)
    scheduleRefresh()
    return runner
  }

  function refresh() {
    const snapshot = buildSnapshot(objects, metas, () => `node-${nextId++}`)
    nodes.value = snapshot.nodes
    links.value = snapshot.links
    revision.value += 1
  }

  function scheduleRefresh() {
    if (refreshPending) return
    refreshPending = true
    void nextTick(() => {
      refreshPending = false
      refresh()
    })
  }

  function dispose() {
    for (const handle of stopHandles.splice(0)) handle()
    for (const runner of effectRunners.splice(0)) stop(runner)
  }

  return {
    dispose,
    links,
    nodes,
    refresh,
    revision,
    scheduleRefresh,
    traceComputed,
    traceEffect,
    traceRef,
    traceRender,
    traceWatch,
  }
}

function buildSnapshot(
  roots: Set<object>,
  metas: WeakMap<object, NodeMeta>,
  createId: (meta: Omit<NodeMeta, 'id'>) => string,
) {
  const queue = [...roots]
  const visited = new Set<object>()
  const included = new Set<object>(roots)
  const relationshipMap = new Map<string, ReactivityGraphLink>()

  for (let index = 0; index < queue.length && index < NODE_LIMIT; index += 1) {
    const current = queue[index]
    if (!current || visited.has(current)) continue
    visited.add(current)
    ensureMeta(current, metas, createId)

    for (const link of walkLinks(readSubscribersHead(current), 'nextSub')) {
      const subscriber = asObject(link.sub)
      if (!subscriber || !shouldIncludeEndpoint(subscriber)) continue
      ensureMeta(subscriber, metas, createId)
      included.add(subscriber)
      addRelationship(current, subscriber, metas, relationshipMap)
      if (relationshipMap.size >= LINK_LIMIT) break
    }

    for (const link of walkLinks(readDepsHead(current), 'nextDep')) {
      const dependency = asObject(link.dep)
      if (!dependency || !shouldIncludeEndpoint(dependency)) continue
      ensureMeta(dependency, metas, createId)
      included.add(dependency)
      addRelationship(dependency, current, metas, relationshipMap)
      if (relationshipMap.size >= LINK_LIMIT) break
    }
  }

  const graphNodes = [...new Set([...included, ...visited])]
    .map((source) => toGraphNode(source, metas))
    .filter((node): node is ReactivityGraphNode => node !== undefined)
    .sort((a, b) => a.label.localeCompare(b.label))

  return {
    links: [...relationshipMap.values()],
    nodes: graphNodes,
  }
}

function addRelationship(
  from: object,
  to: object,
  metas: WeakMap<object, NodeMeta>,
  relationshipMap: Map<string, ReactivityGraphLink>,
) {
  const fromMeta = metas.get(from)
  const toMeta = metas.get(to)
  if (!fromMeta || !toMeta || fromMeta.id === toMeta.id) return

  const id = `${fromMeta.id}->${toMeta.id}`
  if (relationshipMap.has(id)) return

  relationshipMap.set(id, {
    from: fromMeta.id,
    id,
    to: toMeta.id,
  })
}

function ensureMeta(
  source: object,
  metas: WeakMap<object, NodeMeta>,
  createId: (meta: Omit<NodeMeta, 'id'>) => string,
) {
  if (metas.has(source)) return

  const inferred = inferMeta(source)
  metas.set(source, {
    ...inferred,
    id: createId(inferred),
  })
}

function inferMeta(source: object): Omit<NodeMeta, 'id'> {
  const constructorName = getConstructorName(source)

  if (constructorName === 'ComputedRefImpl') {
    return {
      label: 'Anonymous Computed',
      preview: () => readValue(source),
      subtitle: 'discovered computed ref',
      type: 'computed',
    }
  }

  if (constructorName === 'RefImpl') {
    return {
      label: 'Anonymous Ref',
      preview: () => readValue(source),
      subtitle: 'discovered ref',
      type: 'ref',
    }
  }

  if (isWatchConstructor(constructorName)) {
    return {
      label: 'Anonymous Watch',
      preview: () => 'watch callback',
      subtitle: 'discovered watcher',
      type: 'watch',
    }
  }

  if (constructorName === 'SetupRenderEffect') {
    return {
      label: 'Anonymous Render',
      preview: () => 'SetupRenderEffect',
      subtitle: 'component render subscriber',
      type: 'render',
    }
  }

  if (constructorName === 'ReactiveEffect') {
    return {
      label: 'Anonymous Effect',
      preview: () => 'ReactiveEffect',
      subtitle: 'discovered effect',
      type: 'effect',
    }
  }

  if (constructorName === 'Dep') {
    const key = formatKey((source as TraceObject).key)
    return {
      label: key === 'property' ? 'Reactive Property' : `reactive.${key}`,
      preview: () => key,
      subtitle: 'reactive property dep',
      type: 'reactive',
    }
  }

  return {
    label: constructorName || 'Unknown',
    preview: () => constructorName || 'Unknown',
    subtitle: 'unregistered node',
    type: 'unknown',
  }
}

function toGraphNode(
  source: object,
  metas: WeakMap<object, NodeMeta>,
): ReactivityGraphNode | undefined {
  const meta = metas.get(source)
  if (!meta) return

  return {
    id: meta.id,
    label: meta.label,
    runCount: meta.runCount?.(),
    subtitle: meta.subtitle,
    type: meta.type,
    value: formatValue(meta.preview?.()),
  } satisfies ReactivityGraphNode
}

function collectSubscribers(source: unknown) {
  const object = asObject(source)
  if (!object) return []
  return walkLinks(readSubscribersHead(object), 'nextSub')
    .map((link) => asObject(link.sub))
    .filter((item): item is TraceObject => item !== undefined)
}

function normalizeWatchSources<T>(source: WatchSource<T> | WatchSource<T>[]) {
  const sources = Array.isArray(source) ? source : [source]
  return sources
    .map((item) => asObject(item))
    .filter((item): item is TraceObject => item !== undefined)
}

function readSubscribersHead(source: object) {
  const record = source as TraceObject
  return asDependencyLink(record.subs) ?? asDependencyLink(record._subs)
}

function readDepsHead(source: object) {
  return asDependencyLink((source as TraceObject).deps)
}

function walkLinks(head: DependencyLink | undefined, nextKey: 'nextDep' | 'nextSub') {
  const links: DependencyLink[] = []
  const seen = new Set<DependencyLink>()

  for (let current = head; current && !seen.has(current); current = current[nextKey]) {
    seen.add(current)
    links.push(current)
    if (links.length >= LINK_LIMIT) break
  }

  return links
}

function shouldIncludeEndpoint(source: object) {
  return getConstructorName(source) !== 'EffectScope'
}

function isWatchConstructor(constructorName: string) {
  return constructorName === 'WatcherEffect' || constructorName === 'RenderWatcherEffect'
}

function asObject(value: unknown): TraceObject | undefined {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? (value as TraceObject)
    : undefined
}

function asDependencyLink(value: unknown): DependencyLink | undefined {
  return asObject(value) as DependencyLink | undefined
}

function readValue(source: object) {
  const record = source as TraceObject
  return 'value' in record ? record.value : record._value
}

function getConstructorName(value: unknown) {
  return asObject(value)?.constructor?.name ?? ''
}

function formatKey(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol')
    return value.description ? `Symbol(${value.description})` : 'Symbol'
  return 'property'
}

function formatValue(value: unknown) {
  if (typeof value === 'undefined') return 'undefined'
  if (value == null) return String(value)
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'function') return value.name ? `fn ${value.name}` : 'function'
  if (typeof value === 'object') {
    const keys = Reflect.ownKeys(value).slice(0, 3).map(String)
    return `${value.constructor?.name ?? 'Object'}${keys.length ? ` { ${keys.join(', ')} }` : ''}`
  }
  if (typeof value === 'symbol')
    return value.description ? `Symbol(${value.description})` : 'Symbol'
  return Object.prototype.toString.call(value)
}

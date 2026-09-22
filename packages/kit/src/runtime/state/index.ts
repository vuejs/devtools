import { ValueHandleRegistry, encodeValue } from '../../codec'
import type { ComponentId, InstanceRef } from '../types'
import { RuntimeRegistry } from '../registry'
import type { RuntimeBudget } from '../budget'
import type {
  ComponentStateSnapshotMessage,
  ExpandedValueMessage,
  StateEntry,
  ComponentStateSection,
  ReactivityGraphSnapshot,
} from '../../protocol'
import { supportsReactivityGraphVueVersion } from '../../protocol'
import {
  createSectionSources,
  stringifyStateKey,
  toSectionLabel,
  resolveEntryEditable,
} from './sections'
import {
  readPath,
  resolvePath,
  getEditableSectionTarget,
  setStateValue,
  deleteStateValue,
  addStateValue,
} from './edit'
import { isInstanceUnmounted } from './instance'
import { resolveComputedRef, triggerComputedRef } from './computed'
import { readObject, readUnknownProperty, safeOwnKeys, readObjectValue } from './shared'
import type { SectionSource } from './sections'
import { buildComponentReactivityGraph } from './reactivity-graph'

export interface LegacyComponentStateEntry {
  type?: string
  key?: string | number | symbol
  value?: unknown
  editable?: boolean
  meta?: Record<string, unknown>
  objectType?: string
  raw?: string
}

const MAX_HANDLE_SCOPES = 8

export class ComponentStateCollector {
  private handles: ValueHandleRegistry
  private handleScopes: string[] = []
  private versions = new Map<ComponentId, number>()
  private reactivityGraphIds = new WeakMap<object, string>()
  private reactivityGraphIdSeed = 0

  constructor(
    private readonly registry: RuntimeRegistry,
    private readonly budget: RuntimeBudget,
  ) {
    this.handles = new ValueHandleRegistry({ maxHandles: budget.state.maxHandles })
  }

  get handleCount(): number {
    return this.handles.size
  }

  /**
   * Starts a fresh handle scope for a state snapshot: stale handles from
   * earlier snapshots of the same component/inspector node are released, and
   * scopes beyond the retention window are recycled so switching components
   * cannot grow the registry without bound.
   */
  beginStateScope(scope: string): string {
    this.handles.releaseScope(scope)
    const index = this.handleScopes.indexOf(scope)
    if (index >= 0) this.handleScopes.splice(index, 1)
    this.handleScopes.push(scope)
    while (this.handleScopes.length > MAX_HANDLE_SCOPES) {
      const oldest = this.handleScopes.shift()
      if (oldest) this.handles.releaseScope(oldest)
    }
    return scope
  }

  invalidate(componentId: ComponentId): number {
    const version = (this.versions.get(componentId) ?? 0) + 1
    this.versions.set(componentId, version)
    return version
  }

  hasSnapshot(componentId: ComponentId): boolean {
    return this.handleScopes.includes(stateScopeKey(componentId))
  }

  snapshot(
    componentId: ComponentId,
    maxEntries = this.budget.state.maxEntries,
  ): ComponentStateSnapshotMessage | undefined {
    const record = this.registry.getComponent(componentId)
    if (!record) return

    const version = this.versions.get(componentId) ?? this.invalidate(componentId)
    const instance = record.instance
    const app = this.registry.getApp(record.appId)
    const reactivityGraph = supportsReactivityGraphVueVersion(app?.version)
      ? this.collectReactivityGraph(instance)
      : undefined
    const entries = normalizeMaxEntries(maxEntries, this.budget.state.maxEntries)
    const scope = this.beginStateScope(stateScopeKey(componentId))
    const sections = createSectionSources(instance)
      .map((section) => this.collectSection(section, entries, scope))
      .filter((section) => section.entries.length > 0)

    return {
      componentId,
      reactivityGraph,
      version,
      sections,
    }
  }

  expand(
    handle: string,
    path: string[] = [],
    maxEntries = this.budget.state.maxEntries,
  ): ExpandedValueMessage | undefined {
    const root = this.handles.get(handle)
    if (!root) return

    const value = path.length ? readPath(root, path) : root
    const entries = normalizeMaxEntries(maxEntries, this.budget.state.maxEntries)
    return {
      handle,
      path,
      value: encodeValue(value, {
        handles: this.handles,
        handleScope: this.handles.getScope(handle),
        maxDepth: 1,
        maxEntries: entries,
        maxStringLength: this.budget.state.maxStringLength,
      }),
    }
  }

  getHandleValue(handle: string): object | undefined {
    return this.handles.get(handle)
  }

  resolveEntryValue(
    componentId: ComponentId,
    sectionId: string,
    path: string[],
  ): { found: boolean; value?: unknown } {
    const record = this.registry.getComponent(componentId)
    if (!record) return { found: false }

    const source = createSectionSources(record.instance).find(
      (section) => section.id === sectionId,
    )?.source
    if (!source) return { found: false }

    return resolvePath(source, path)
  }

  /** `triggerRef` the live computed for this state path. */
  recompute(componentId: ComponentId, sectionId: string, path: string[]): boolean {
    const record = this.registry.getComponent(componentId)
    if (!record || isInstanceUnmounted(record.instance)) return false

    const computedRef = resolveComputedRef(record.instance, sectionId, path)
    if (!computedRef) return false

    triggerComputedRef(computedRef)
    return true
  }

  edit(
    componentId: ComponentId,
    sectionId: string,
    path: string[],
    value: unknown,
    newKey?: string,
  ): boolean {
    const record = this.registry.getComponent(componentId)
    if (!record || path.length < 1) return false

    const target = getEditableSectionTarget(record.instance, sectionId, path[0])
    if (!target) return false

    return setStateValue(target, path, value, newKey)
  }

  delete(componentId: ComponentId, sectionId: string, path: string[]): boolean {
    const record = this.registry.getComponent(componentId)
    if (!record || path.length < 1) return false

    const target = getEditableSectionTarget(record.instance, sectionId, path[0])
    if (!target) return false

    return deleteStateValue(target, path)
  }

  add(componentId: ComponentId, sectionId: string, path: string[], value: unknown): boolean {
    const record = this.registry.getComponent(componentId)
    if (!record || path.length < 1) return false

    const target = getEditableSectionTarget(record.instance, sectionId, path[0])
    if (!target) return false

    return addStateValue(target, path, value)
  }

  appendLegacyEntries(
    snapshot: ComponentStateSnapshotMessage,
    entries: LegacyComponentStateEntry[],
  ): void {
    const scope = stateScopeKey(snapshot.componentId)
    for (const entry of entries) {
      const sectionId = entry.type || 'data'
      const key = stringifyStateKey(entry.key ?? '')
      if (!key) continue

      let section = snapshot.sections.find((item) => item.id === sectionId)
      if (!section) {
        section = {
          id: sectionId,
          label: toSectionLabel(sectionId),
          entries: [],
        }
        snapshot.sections.push(section)
      }

      section.entries.push({
        key,
        path: [sectionId, key],
        value: this.encodeStateValue(entry.value, scope),
        editable: entry.editable === true,
        meta: {
          ...entry.meta,
          ...(entry.objectType ? { stateTypeName: entry.objectType } : {}),
          ...(entry.raw ? { raw: entry.raw } : {}),
        },
      })
    }
  }

  async executeCustomAction(handle: string, actionIndex: number): Promise<boolean> {
    const value = this.handles.get(handle)
    const custom = value ? readObject(value, '_custom') : undefined
    const actions = custom ? readUnknownProperty(custom, 'actions') : undefined
    if (!Array.isArray(actions)) return false

    const action = actions[actionIndex]
    const callback =
      typeof action === 'function'
        ? action
        : action != null && typeof action === 'object'
          ? readUnknownProperty(action, 'action')
          : undefined

    if (typeof callback !== 'function') return false
    await callback()
    return true
  }

  clear(): void {
    this.handles.clear()
    this.handleScopes = []
    this.versions.clear()
    this.reactivityGraphIds = new WeakMap()
    this.reactivityGraphIdSeed = 0
  }

  private encodeStateValue(value: unknown, scope?: string): StateEntry['value'] {
    return encodeValue(value, {
      handles: this.handles,
      handleScope: scope,
      maxDepth: this.budget.state.lazyChildren ? 1 : this.budget.state.maxDepth,
      maxEntries: this.budget.state.maxEntries,
      maxStringLength: this.budget.state.maxStringLength,
    })
  }

  private collectSection(
    source: SectionSource,
    maxEntries: number,
    scope: string,
  ): ComponentStateSection {
    const keys = source.source ? safeOwnKeys(source.source).slice(0, maxEntries) : []
    const entries: StateEntry[] = []

    for (const key of keys) {
      const stateKey = stringifyStateKey(key)
      if (!stateKey) continue

      // A single broken entry (throwing meta reader or hostile value) must not
      // take down the whole section; degrade it to an error value instead.
      let meta: Record<string, unknown> | undefined
      let value: StateEntry['value']
      try {
        meta = source.meta?.(stateKey)
        value = encodeValue(readObjectValue(source.source!, key), {
          handles: this.handles,
          handleScope: scope,
          maxDepth: this.budget.state.lazyChildren ? 1 : this.budget.state.maxDepth,
          maxEntries,
          maxStringLength: this.budget.state.maxStringLength,
        })
      } catch (error) {
        meta = undefined
        value = {
          kind: 'error',
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        }
      }

      entries.push({
        key: stateKey,
        path: [source.id, stateKey],
        value,
        editable: resolveEntryEditable(source.editable, meta, stateKey),
        meta,
      })
    }

    return {
      id: source.id,
      label: source.label,
      entries,
      partial: !!source.source && safeOwnKeys(source.source).length > keys.length,
    }
  }

  private collectReactivityGraph(instance: InstanceRef): ReactivityGraphSnapshot | undefined {
    const graph = buildComponentReactivityGraph(instance, (reference) =>
      this.getReactivityGraphNodeId(reference),
    )
    return graph.nodes.length ? graph : undefined
  }

  private getReactivityGraphNodeId(reference: object): string {
    const existing = this.reactivityGraphIds.get(reference)
    if (existing) return existing

    const id = `reactivity-${++this.reactivityGraphIdSeed}`
    this.reactivityGraphIds.set(reference, id)
    return id
  }
}

function stateScopeKey(componentId: string): string {
  return `state:${componentId}`
}

function normalizeMaxEntries(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(Math.floor(value), 5000))
}

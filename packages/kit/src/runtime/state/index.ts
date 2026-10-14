import { StatePages } from './pagination'
import { safeOwnEnumerableStringKeys } from '../../codec/encode'
import { ValueHandleRegistry, encodeValue } from '../../codec'
import type { ComponentId, InstanceRef } from '../types'
import { RuntimeRegistry } from '../registry'
import type { RuntimeBudget } from '../budget'
import type {
  ComponentStateSnapshotMessage,
  ExpandedValueMessage,
  StateEntry,
  StateValueMessage,
  StatePageOptions,
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
  private pages: StatePages
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
    this.pages = new StatePages(budget.transport.maxMessageBytes)
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
    maxPreviewEntries = maxEntries,
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
    const previewEntries = normalizeMaxEntries(maxPreviewEntries, entries)
    const scope = this.beginStateScope(stateScopeKey(componentId))
    const sections = createSectionSources(instance)
      .map((section) => this.collectSection(section, entries, scope, previewEntries))
      .filter((section) => section.entries.length > 0)

    return {
      componentId,
      reactivityGraph,
      version,
      sections,
    }
  }

  statePage(
    target: string,
    options: StatePageOptions,
    componentId: string,
    legacy: LegacyComponentStateEntry[] = [],
    initial?: ComponentStateSnapshotMessage,
  ): ComponentStateSnapshotMessage {
    return this.pages.read(target, options, () => {
      const scope = initial
        ? stateScopeKey(componentId)
        : this.beginStateScope(stateScopeKey(componentId))
      const record = this.registry.getComponent(componentId)
      const fields: { id: string; label: string; read: () => StateEntry }[] = []
      if (record) {
        for (const source of createSectionSources(record.instance)) {
          const cached = new Map(
            initial?.sections
              .find((section) => section.id === source.id)
              ?.entries.map((entry) => [entry.key, entry]),
          )
          for (const key of source.source ? safeOwnKeys(source.source) : []) {
            if (!stringifyStateKey(key)) continue
            fields.push({
              id: source.id,
              label: source.label,
              read: () => {
                const entry = cached.get(stringifyStateKey(key))
                if (entry) {
                  cached.delete(entry.key)
                  return entry
                }
                return this.collectSection(source, 1, scope, 30, [key]).entries[0]!
              },
            })
          }
        }
      }
      for (const entry of legacy) {
        const id = entry.type || 'data'
        const key = stringifyStateKey(entry.key ?? '')
        if (!key) continue
        fields.push({
          id,
          label: toSectionLabel(id),
          read: () => this.encodePluginStateEntry(entry, id, key, scope, 30),
        })
      }
      const totals = new Map<string, number>()
      for (const field of fields) totals.set(field.id, (totals.get(field.id) ?? 0) + 1)
      // Keep each section contiguous so byte trimming preserves the same field order.
      const order = new Map([...totals.keys()].map((id, index) => [id, index]))
      fields.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      const version = this.versions.get(componentId) ?? 0
      const graph = initial
        ? initial.reactivityGraph
        : record && supportsReactivityGraphVueVersion(this.registry.getApp(record.appId)?.version)
          ? this.collectReactivityGraph(record.instance)
          : undefined
      return {
        total: fields.length,
        read: (offset, limit) => {
          const sections: ComponentStateSection[] = []
          for (const field of fields.slice(offset, offset + limit)) {
            let section = sections.find((section) => section.id === field.id)
            if (!section) {
              section = { id: field.id, label: field.label, entries: [] }
              sections.push(section)
            }
            section.entries.push(field.read())
          }
          for (const section of sections)
            section.partial = section.entries.length < totals.get(section.id)!
          return {
            componentId,
            version,
            sections,
            ...(offset === 0 && graph ? { reactivityGraph: graph } : {}),
          }
        },
      }
    }) as ComponentStateSnapshotMessage
  }

  expandPage(
    target: string,
    options: StatePageOptions,
    handle: string,
    path: string[] = [],
  ): ExpandedValueMessage | { found: false } | undefined {
    const root = this.handles.get(handle)
    if (!root) return
    const resolved = path.length ? resolvePath(root, path) : { found: true, value: root }
    if (!resolved.found) return { found: false }
    return this.valuePage(
      target,
      options,
      resolved.value,
      this.handles.getScope(handle),
      handle,
      path,
    )
  }

  private valuePage(
    target: string,
    options: StatePageOptions,
    value: unknown,
    scope?: string,
    handle = '',
    path: string[] = [],
  ): ExpandedValueMessage {
    const maxPageSize = typeof value === 'string' ? 5000 : 500
    const pageOptions = {
      ...options,
      pageSize: options.pageSize ?? (typeof value === 'string' ? 5000 : 50),
    }
    return this.pages.read(
      target,
      pageOptions,
      () => {
        // Snapshot Map/Set membership once so each page slices rather than re-walking the collection.
        const mapEntries = value instanceof Map ? Array.from(value) : undefined
        const setItems = value instanceof Set ? Array.from(value) : undefined
        const objectKeys =
          value && typeof value === 'object' && !Array.isArray(value) && !mapEntries && !setItems
            ? safeOwnEnumerableStringKeys(value)
            : undefined
        const encodeOptions = {
          handles: this.handles,
          handleScope: scope,
          maxDepth: 1,
          maxStringLength: this.budget.state.maxStringLength,
        }
        const encode = (offset: number, limit: number) => {
          if (typeof value === 'string')
            return { kind: 'string' as const, value: value.slice(offset, offset + limit) }
          if (mapEntries)
            return encodeValue(new Map(mapEntries.slice(offset, offset + limit)), {
              ...encodeOptions,
              maxEntries: limit,
            })
          if (setItems) {
            const encoded = encodeValue(new Set(setItems.slice(offset, offset + limit)), {
              ...encodeOptions,
              maxEntries: limit,
            })
            if (encoded.kind === 'set')
              encoded.preview = encoded.preview.map((entry, index) => ({
                key: String(offset + index),
                value: entry.value,
              }))
            return encoded
          }
          return encodeValue(value, {
            entryKeys: objectKeys,
            ...encodeOptions,
            maxEntries: limit,
            entryOffset: offset,
          })
        }
        const total = (() => {
          if (typeof value === 'string') return value.length
          if (Array.isArray(value)) return value.length
          if (mapEntries || setItems) return (mapEntries ?? setItems)!.length
          const summary = encode(0, 0)
          return summary.kind === 'object' ? summary.entries : 1
        })()
        return { total, read: (offset, limit) => ({ handle, path, value: encode(offset, limit) }) }
      },
      maxPageSize,
    ) as ExpandedValueMessage
  }

  expand(
    handle: string,
    path: string[] = [],
    maxEntries = this.budget.state.maxEntries,
  ): ExpandedValueMessage | { found: false } | undefined {
    const root = this.handles.get(handle)
    if (!root) return

    let value: unknown = root
    if (path.length) {
      const resolved = resolvePath(root, path)
      if (!resolved.found) return { found: false }
      value = resolved.value
    }
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

  readStateValue(
    componentId: ComponentId,
    sectionId: string,
    path: string[],
    options?: StatePageOptions,
  ): StateValueMessage {
    const record = this.registry.getComponent(componentId)
    if (!record || !path.length) return { found: false }
    const section = createSectionSources(record.instance).find(
      (section) => section.id === sectionId,
    )
    if (!section?.source) return { found: false }
    const key = path[0]!
    return this.readStatePath(
      section.source,
      path,
      stateScopeKey(componentId),
      resolveEntryEditable(section.editable, section.meta?.(key), key),
      options,
      JSON.stringify([componentId, sectionId, path]),
    )
  }

  readStatePath(
    source: object,
    path: string[],
    scope: string,
    editable: boolean,
    options?: StatePageOptions,
    target = JSON.stringify([scope, path]),
  ): StateValueMessage {
    let value: unknown = source
    // Resolve each segment once: getters can have side effects. Preserve readonly
    // boundaries even when a nested value belongs to an editable section.
    // The section root itself can be shallowReadonly (Vue props) while nested
    // values stay writable, so the flag applies only after the first segment.
    for (let depth = 0; depth <= path.length; depth++) {
      if (
        depth > 0 &&
        value &&
        typeof value === 'object' &&
        readUnknownProperty(value, '__v_isReadonly') === true
      )
        editable = false
      if (depth === path.length) break
      if (value == null || (typeof value !== 'object' && typeof value !== 'function'))
        return { found: false }
      const resolved = resolvePath(value, [path[depth]!])
      if (!resolved.found) return { found: false }
      value = resolved.value
    }
    if (!options?.snapshotId) this.beginStateScope(scope)
    if (options) {
      const result = this.valuePage(target, options, value, scope)
      return {
        found: true,
        editable,
        value: result.value,
        pagination: result.pagination,
        snapshotId: result.snapshotId,
      }
    }
    return { found: true, editable, value: this.encodeStateValue(value, scope, 30) }
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
    limits?: { maxEntries?: number; maxPreviewEntries?: number },
  ): void {
    const scope = stateScopeKey(snapshot.componentId)
    const maxEntries = limits
      ? normalizeMaxEntries(
          limits.maxEntries ?? this.budget.state.maxEntries,
          this.budget.state.maxEntries,
        )
      : Infinity
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

      if (section.entries.length >= maxEntries) {
        section.partial = true
        continue
      }
      section.entries.push(
        this.encodePluginStateEntry(entry, sectionId, key, scope, limits?.maxPreviewEntries),
      )
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
    this.pages.clear()
    this.handles.clear()
    this.handleScopes = []
    this.versions.clear()
    this.reactivityGraphIds = new WeakMap()
    this.reactivityGraphIdSeed = 0
  }

  private encodePluginStateEntry(
    entry: LegacyComponentStateEntry,
    sectionId: string,
    key: string,
    scope: string,
    maxPreviewEntries?: number,
  ): StateEntry {
    return {
      key,
      path: [sectionId, key],
      value: this.encodeStateValue(entry.value, scope, maxPreviewEntries),
      editable: entry.editable === true,
      meta: {
        ...entry.meta,
        ...(entry.objectType ? { stateTypeName: entry.objectType } : {}),
        ...(entry.raw ? { raw: entry.raw } : {}),
      },
    }
  }

  private encodeStateValue(
    value: unknown,
    scope?: string,
    maxPreviewEntries = this.budget.state.maxEntries,
  ): StateEntry['value'] {
    return encodeValue(value, {
      handles: this.handles,
      handleScope: scope,
      maxDepth: this.budget.state.lazyChildren ? 1 : this.budget.state.maxDepth,
      maxEntries: normalizeMaxEntries(maxPreviewEntries, this.budget.state.maxEntries),
      maxStringLength: this.budget.state.maxStringLength,
    })
  }

  private collectSection(
    source: SectionSource,
    maxEntries: number,
    scope: string,
    maxPreviewEntries: number,
    selectedKeys?: PropertyKey[],
  ): ComponentStateSection {
    const keys =
      selectedKeys ?? (source.source ? safeOwnKeys(source.source).slice(0, maxEntries) : [])
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
          maxEntries: maxPreviewEntries,
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
      partial: !selectedKeys && !!source.source && safeOwnKeys(source.source).length > keys.length,
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

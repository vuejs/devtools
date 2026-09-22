import type { ComponentTreePatch, ComponentTreePageMessage } from '../protocol'
import type { AppId, ComponentId, InstanceRef, RuntimeEvent } from './types'
import type { RuntimeBudget } from './budget'
import type { AppRecord, ComponentRecord, ComponentSnapshot, RuntimeRegistry } from './registry'
import { ComponentDomOrderCache, type WalkedComponentChild } from './registry'

interface ComponentExpansion {
  parent: ComponentRecord
  children: WalkedComponentChild[]
  index: number
  page: number
  touchedAt: number
  domOrder: ComponentDomOrderCache
}

export interface ComponentTreeSnapshot {
  appId?: AppId
  version: number
  nodes: ComponentSnapshot[]
}

export interface ComponentTreePatchBatch {
  appId: AppId
  version: number
  patches: ComponentTreePatch[]
}

export class ComponentTreeStore {
  includePerfMetrics = false
  private appVersions = new Map<AppId, number>()
  private nodesByApp = new Map<AppId, Map<ComponentId, ComponentSnapshot>>()
  private childrenByApp = new Map<AppId, Map<ComponentId | undefined, Set<ComponentId>>>()
  private visibleNodesByApp = new Map<AppId, Set<ComponentId>>()
  private expandedNodesByApp = new Map<AppId, Set<ComponentId>>()
  private expansionSeed = 0
  private expansions = new Map<string, ComponentExpansion>()
  // Pagination materializes only part of a parent's children. Retain the rest
  // independently of the cursor so cancellation cannot make them disappear.
  private pendingChildren = new Map<ComponentId, { appId: AppId; instances: Set<InstanceRef> }>()
  private pendingParents = new WeakMap<InstanceRef, ComponentId>()

  constructor(
    private readonly registry: RuntimeRegistry,
    private readonly budget: RuntimeBudget['components'],
  ) {}

  syncApp(app: AppRecord): ComponentTreePatchBatch | undefined {
    const patches: ComponentTreePatch[] = []

    for (const record of app.components.values()) {
      patches.push(...this.upsert(record))
    }

    return this.commit(app.id, patches)
  }

  apply(event: RuntimeEvent, record?: ComponentRecord): ComponentTreePatchBatch | undefined {
    switch (event.type) {
      case 'component:add':
      case 'component:update': {
        if (!record) return
        const patches = this.upsert(record)

        const visible = this.getVisibleNodes(event.appId)
        const expanded = this.getExpandedNodes(event.appId)
        const wasVisible = visible.has(record.id)
        const parentVisible = !!record.parentId && visible.has(record.parentId)
        if (!wasVisible && this.budget.autoTrack && parentVisible && expanded.has(record.parentId!))
          visible.add(record.id)

        return this.commit(
          event.appId,
          patches.filter((patch) => this.isPatchVisible(event.appId, patch)),
        )
      }
      case 'component:remove': {
        const pendingParent = event.instance ? this.removePendingChild(event.instance) : undefined
        if (!record && pendingParent) {
          const patch = this.createChildCountPatch(event.appId, pendingParent)
          return patch && this.isPatchVisible(event.appId, patch)
            ? this.commit(event.appId, [patch])
            : undefined
        }
        if (!record) return
        const visible = this.getVisibleNodes(event.appId)
        const wasVisible = visible.has(record.id)
        const patches = this.remove(record)
        visible.delete(record.id)
        this.getExpandedNodes(event.appId).delete(record.id)
        return this.commit(
          event.appId,
          wasVisible
            ? patches.filter((patch) => this.isPatchVisible(event.appId, patch, record.id))
            : patches.filter(
                (patch) => patch.op === 'update' && this.getVisibleNodes(event.appId).has(patch.id),
              ),
        )
      }
      case 'app:unmount': {
        const app = this.registry.getAppByRef(event.app)
        if (!app) return
        this.nodesByApp.delete(app.id)
        this.childrenByApp.delete(app.id)
        this.appVersions.delete(app.id)
        this.visibleNodesByApp.delete(app.id)
        this.expandedNodesByApp.delete(app.id)
        return
      }
    }
  }

  snapshot(appId?: AppId): ComponentTreeSnapshot {
    const app = appId ? this.registry.getApp(appId) : this.registry.listApps()[0]
    if (!app) return { appId, version: 0, nodes: [] }

    const records = this.registry.refreshComponentTree(app.id, {
      maxDepth: this.budget.maxInitialDepth,
    })
    const visible = this.getVisibleNodes(app.id)
    const expanded = this.getExpandedNodes(app.id)
    visible.clear()
    expanded.clear()
    this.clearPendingChildren(app.id)

    const patches: ComponentTreePatch[] = []
    for (const record of records) {
      visible.add(record.id)
      if (this.registry.getComponentDepth(record) < this.budget.maxInitialDepth)
        expanded.add(record.id)
      patches.push(...this.upsert(record))
    }
    this.pruneToVisible(app.id)
    this.commit(app.id, patches)

    return {
      appId: app.id,
      version: this.appVersions.get(app.id) ?? 0,
      nodes: this.readOrderedNodes(app.id).filter((node) =>
        this.getVisibleNodes(app.id).has(node.id),
      ),
    }
  }

  expand(appId: AppId, componentId: ComponentId): ComponentTreePatchBatch | undefined {
    const record = this.registry.getComponent(componentId, appId)
    if (!record || this.registry.getComponentDepth(record) >= this.budget.maxExpandedDepth) return

    const visible = this.getVisibleNodes(appId)
    const expanded = this.getExpandedNodes(appId)
    expanded.add(componentId)
    const records = this.registry.refreshComponentTree(appId, {
      maxDepth: 1,
      rootComponentId: componentId,
    })
    const patches: ComponentTreePatch[] = []

    for (const child of records) {
      this.upsert(child)
      if (child.id === componentId || visible.has(child.id)) continue
      visible.add(child.id)
      patches.push({
        op: 'insert',
        parentId: child.parentId,
        node: this.toSnapshot(child),
      })
    }

    const parentPatch = this.createChildCountPatch(appId, componentId)
    if (parentPatch) patches.push(parentPatch)
    return this.commit(appId, patches)
  }

  // Pull one bounded page at a time. Replies are acknowledged by the next query,
  // rather than sent through the lossy timeline/event queue.
  readChildrenPage(
    appId: AppId,
    componentId: ComponentId,
    cursor: string | undefined,
    maxMessageBytes: number,
  ): ComponentTreePageMessage {
    const now = Date.now()
    for (const [key, value] of this.expansions) {
      if (now - value.touchedAt > 30_000) this.deleteExpansion(key)
    }
    const [cursorId, page] = cursor?.split(':') ?? []
    let id = cursorId
    let expansion = id ? this.expansions.get(id) : undefined
    if (cursor && (!expansion || Number(page) !== expansion.page))
      throw new Error('Component expansion expired; expand the node again')

    if (!expansion) {
      const parent = this.registry.getComponent(componentId, appId)
      if (!parent || this.registry.getComponentDepth(parent) >= this.budget.maxExpandedDepth)
        return { nodes: [] }
      if (this.expansions.size >= 32) throw new Error('Too many pending component expansions')
      id = String(++this.expansionSeed)
      expansion = {
        parent,
        children: this.registry.getComponentChildren(parent),
        index: 0,
        page: 0,
        touchedAt: now,
        domOrder: new ComponentDomOrderCache(true),
      }
      const known = this.getChildren(appId).get(componentId)
      const pending = new Set(
        expansion.children
          .map((child) => child.instance)
          .filter((instance) => !known?.has(this.registry.getComponentId(instance)!)),
      )
      this.pendingChildren.set(componentId, { appId, instances: pending })
      for (const instance of pending) this.pendingParents.set(instance, componentId)
      this.expansions.set(id, expansion)
    }

    const { parent } = expansion
    if (parent.appId !== appId || parent.id !== componentId)
      throw new Error('Component expansion target changed')
    if (this.registry.getComponent(componentId, appId) !== parent) {
      this.deleteExpansion(id!)
      return { nodes: [] }
    }
    this.getExpandedNodes(appId).add(componentId)
    expansion.touchedAt = now
    const nodes: ComponentSnapshot[] = []
    const cache = expansion.domOrder
    cache.preparePage()
    const byteLimit = Math.min(128 * 1024, maxMessageBytes) - 256
    let bytes = 0
    const started = performance.now()
    while (expansion.index < expansion.children.length && nodes.length < 256) {
      const child = expansion.children[expansion.index]!
      const record = this.registry.refreshChild(parent, child, cache)
      if (record && !record.hidden) {
        const node = this.toSnapshot(record)
        const size = new TextEncoder().encode(JSON.stringify(node)).byteLength + 1
        if (size > byteLimit) {
          this.deleteExpansion(id!)
          throw new Error('Component metadata exceeds the message budget')
        }
        if (bytes + size > byteLimit) break
        bytes += size
        // Always return the page, even if another client has already expanded it.
        this.upsert(record, false)
        this.getVisibleNodes(appId).add(record.id)
        nodes.push(node)
      }
      expansion.index++
      if (performance.now() - started >= 4) break
    }
    expansion.page++
    if (expansion.index >= expansion.children.length) {
      this.deleteExpansion(id!)
      return { nodes }
    }
    return { nodes, cursor: `${id}:${expansion.page}` }
  }

  cancelChildrenPage(appId: AppId, cursor: string): void {
    const id = cursor.split(':')[0]!
    if (this.expansions.get(id)?.parent.appId === appId) this.deleteExpansion(id)
  }

  private deleteExpansion(id: string): void {
    this.expansions.get(id)?.domOrder.dispose()
    this.expansions.delete(id)
  }

  resetTrackingCache(): void {
    for (const id of this.expansions.keys()) this.deleteExpansion(id)
    this.appVersions.clear()
    this.nodesByApp.clear()
    this.childrenByApp.clear()
    this.visibleNodesByApp.clear()
    this.expandedNodesByApp.clear()
    this.pendingChildren.clear()
    this.pendingParents = new WeakMap()
  }

  revealPath(appId: AppId, componentId: ComponentId): ComponentSnapshot[] {
    const path: ComponentRecord[] = []
    const seen = new Set<ComponentId>()
    let record = this.registry.getComponent(componentId, appId)
    while (record && !seen.has(record.id)) {
      seen.add(record.id)
      path.push(record)
      record = record.parentId ? this.registry.getComponent(record.parentId, appId) : undefined
    }
    return path.reverse().map((entry) => {
      this.upsert(entry, false)
      const known = this.getChildren(appId).get(entry.id)
      const pending = new Set(
        this.registry
          .getComponentChildren(entry)
          .map((child) => child.instance)
          .filter((instance) => !known?.has(this.registry.getComponentId(instance)!)),
      )
      this.pendingChildren.set(entry.id, { appId, instances: pending })
      for (const instance of pending) this.pendingParents.set(instance, entry.id)
      this.getVisibleNodes(appId).add(entry.id)
      return this.toSnapshot(entry)
    })
  }

  getVersion(appId: AppId): number {
    return this.appVersions.get(appId) ?? 0
  }

  isVisible(appId: AppId, componentId: ComponentId): boolean {
    return this.visibleNodesByApp.get(appId)?.has(componentId) === true
  }

  touch(record: ComponentRecord): ComponentTreePatchBatch | undefined {
    const patches = this.upsert(record).filter((patch) => this.isPatchVisible(record.appId, patch))
    return this.commit(record.appId, patches)
  }

  removeApp(appId: AppId): void {
    this.clearPendingChildren(appId)
    for (const [id, expansion] of this.expansions) {
      if (expansion.parent.appId === appId) this.deleteExpansion(id)
    }
    this.nodesByApp.delete(appId)
    this.childrenByApp.delete(appId)
    this.appVersions.delete(appId)
    this.visibleNodesByApp.delete(appId)
    this.expandedNodesByApp.delete(appId)
  }

  private upsert(record: ComponentRecord, updateParentCounts = true): ComponentTreePatch[] {
    if (record.hidden) return this.remove(record)

    const snapshot = this.toSnapshot(record)
    const nodes = this.getNodes(record.appId)
    const previous = nodes.get(record.id)
    const touchedParents = new Set<ComponentId>()
    const pendingParent = this.removePendingChild(record.instance)
    if (pendingParent) touchedParents.add(pendingParent)

    if (previous?.parentId) touchedParents.add(previous.parentId)
    if (snapshot.parentId) touchedParents.add(snapshot.parentId)

    nodes.set(record.id, snapshot)
    if (!previous || previous.parentId !== snapshot.parentId) {
      if (previous) this.removeChild(record.appId, record.id, previous.parentId)
      this.addChild(record.appId, record.id, snapshot.parentId)
    }

    const patches: ComponentTreePatch[] = []

    if (!previous) {
      patches.push({
        op: 'insert',
        parentId: snapshot.parentId,
        node: snapshot,
      })
    } else {
      const changes = diffComponentSnapshot(previous, snapshot)
      if (changes) patches.push({ op: 'update', id: record.id, changes })
    }

    for (const parentId of updateParentCounts ? touchedParents : []) {
      const patch = this.createChildCountPatch(record.appId, parentId)
      if (patch) patches.push(patch)
    }

    return patches
  }

  private remove(record: ComponentRecord): ComponentTreePatch[] {
    const nodes = this.getNodes(record.appId)
    const previous = nodes.get(record.id)
    if (!previous) return []

    const patches: ComponentTreePatch[] = []
    const children = this.getChildren(record.appId)
    const queue = [record.id]

    for (const id of queue) {
      queue.push(...(children.get(id) ?? []))
    }

    for (const id of queue.reverse()) {
      this.pendingChildren.delete(id)
      nodes.delete(id)
      children.delete(id)
      patches.push({ op: 'remove', id })
    }

    this.removeChild(record.appId, record.id, previous.parentId)
    const parentPatch = this.createChildCountPatch(record.appId, previous.parentId)
    if (parentPatch) patches.push(parentPatch)
    return patches
  }

  private commit(appId: AppId, patches: ComponentTreePatch[]): ComponentTreePatchBatch | undefined {
    if (!patches.length) return

    const version = (this.appVersions.get(appId) ?? 0) + 1
    this.appVersions.set(appId, version)

    return { appId, version, patches }
  }

  private readOrderedNodes(appId: AppId): ComponentSnapshot[] {
    const nodes = this.getNodes(appId)
    const children = this.getChildren(appId)
    const ordered: ComponentSnapshot[] = []
    const visit = (parentId: ComponentId | undefined) => {
      const childIds = [...(children.get(parentId) ?? [])].sort((a, b) =>
        compareComponentOrder(nodes.get(a), nodes.get(b)),
      )
      for (const id of childIds) {
        const node = nodes.get(id)
        if (!node) continue
        ordered.push(node)
        visit(id)
      }
    }

    visit(undefined)

    for (const node of nodes.values()) {
      if (!ordered.includes(node)) ordered.push(node)
    }

    return ordered
  }

  private toSnapshot(record: ComponentRecord): ComponentSnapshot {
    const snapshot = this.registry.toComponentSnapshot(record)
    if (!this.includePerfMetrics) return snapshot
    if (record.lastMountMs != null) snapshot.lastMountMs = record.lastMountMs
    if (record.lastUpdateMs != null) snapshot.lastUpdateMs = record.lastUpdateMs
    return snapshot
  }

  private addChild(
    appId: AppId,
    componentId: ComponentId,
    parentId: ComponentId | undefined,
  ): void {
    const children = this.getChildren(appId)
    const siblings = children.get(parentId) ?? new Set<ComponentId>()
    siblings.add(componentId)
    children.set(parentId, siblings)
  }

  private removeChild(
    appId: AppId,
    componentId: ComponentId,
    parentId: ComponentId | undefined,
  ): void {
    this.getChildren(appId).get(parentId)?.delete(componentId)
  }

  private createChildCountPatch(
    appId: AppId,
    parentId: ComponentId | undefined,
  ): ComponentTreePatch | undefined {
    if (!parentId) return

    const parent = this.getNodes(appId).get(parentId)
    if (!parent) return

    const childCount =
      (this.getChildren(appId).get(parentId)?.size ?? 0) +
      (this.pendingChildren.get(parentId)?.instances.size ?? 0)
    if (parent.childCount === childCount) return

    parent.childCount = childCount
    return { op: 'update', id: parentId, changes: { childCount } }
  }

  private removePendingChild(instance: InstanceRef): ComponentId | undefined {
    const parentId = this.pendingParents.get(instance)
    this.pendingParents.delete(instance)
    if (!parentId) return
    const pending = this.pendingChildren.get(parentId)
    if (!pending?.instances.delete(instance)) return
    if (!pending.instances.size) this.pendingChildren.delete(parentId)
    return parentId
  }

  private clearPendingChildren(appId: AppId): void {
    for (const [id, pending] of this.pendingChildren) {
      if (pending.appId === appId) this.pendingChildren.delete(id)
    }
  }

  private getNodes(appId: AppId): Map<ComponentId, ComponentSnapshot> {
    const nodes = this.nodesByApp.get(appId) ?? new Map<ComponentId, ComponentSnapshot>()
    this.nodesByApp.set(appId, nodes)
    return nodes
  }

  private getChildren(appId: AppId): Map<ComponentId | undefined, Set<ComponentId>> {
    const children =
      this.childrenByApp.get(appId) ?? new Map<ComponentId | undefined, Set<ComponentId>>()
    this.childrenByApp.set(appId, children)
    return children
  }

  private getVisibleNodes(appId: AppId): Set<ComponentId> {
    const visible = this.visibleNodesByApp.get(appId) ?? new Set<ComponentId>()
    this.visibleNodesByApp.set(appId, visible)
    return visible
  }

  private getExpandedNodes(appId: AppId): Set<ComponentId> {
    const expanded = this.expandedNodesByApp.get(appId) ?? new Set<ComponentId>()
    this.expandedNodesByApp.set(appId, expanded)
    return expanded
  }

  private isPatchVisible(
    appId: AppId,
    patch: ComponentTreePatch,
    removingId?: ComponentId,
  ): boolean {
    const visible = this.getVisibleNodes(appId)
    switch (patch.op) {
      case 'insert':
        return visible.has(patch.node.id)
      case 'remove':
        return patch.id === removingId || visible.has(patch.id)
      case 'update':
        return visible.has(patch.id)
      case 'reorder':
        return visible.has(patch.parentId)
    }
  }

  private pruneToVisible(appId: AppId): void {
    const visible = this.getVisibleNodes(appId)
    const nodes = this.getNodes(appId)
    for (const id of nodes.keys()) {
      if (!visible.has(id)) nodes.delete(id)
    }

    const children = this.getChildren(appId)
    children.clear()
    for (const node of nodes.values()) this.addChild(appId, node.id, node.parentId)
  }
}

function diffComponentSnapshot(
  previous: ComponentSnapshot,
  next: ComponentSnapshot,
): Partial<ComponentSnapshot> | undefined {
  const changes: Partial<ComponentSnapshot> = {}

  if (previous.parentId !== next.parentId) changes.parentId = next.parentId
  if (previous.name !== next.name) changes.name = next.name
  if (previous.file !== next.file) changes.file = next.file
  if (previous.renderKey !== next.renderKey) changes.renderKey = next.renderKey
  if (previous.inactive !== next.inactive) changes.inactive = next.inactive
  if (previous.isFragment !== next.isFragment) changes.isFragment = next.isFragment
  if (!isEqualTags(previous.tags, next.tags)) changes.tags = next.tags
  if (!isEqualNumberLists(previous.domOrder, next.domOrder)) changes.domOrder = next.domOrder
  if (previous.consoleId !== next.consoleId) changes.consoleId = next.consoleId
  if (previous.autoOpen !== next.autoOpen) changes.autoOpen = next.autoOpen
  if (previous.updatedAt !== next.updatedAt) changes.updatedAt = next.updatedAt
  if (previous.lastMountMs !== next.lastMountMs) changes.lastMountMs = next.lastMountMs
  if (previous.lastUpdateMs !== next.lastUpdateMs) changes.lastUpdateMs = next.lastUpdateMs
  if (previous.childCount !== next.childCount) changes.childCount = next.childCount

  return Object.keys(changes).length ? changes : undefined
}

function compareComponentOrder(
  previous: ComponentSnapshot | undefined,
  next: ComponentSnapshot | undefined,
): number {
  if (!previous || !next) return 0
  if (previous.inactive && !next.inactive) return 1
  if (!previous.inactive && next.inactive) return -1

  const domOrder = compareIndexLists(previous.domOrder ?? [], next.domOrder ?? [])
  return domOrder === 0 ? previous.id.localeCompare(next.id) : domOrder
}

function compareIndexLists(previous: number[], next: number[]): number {
  if (!previous.length || !next.length) return 0
  if (previous[0] === next[0]) return compareIndexLists(previous.slice(1), next.slice(1))
  return previous[0] - next[0]
}

function isEqualTags(
  previous: ComponentRecord['tags'] | undefined,
  next: ComponentRecord['tags'] | undefined,
): boolean {
  if (!previous?.length && !next?.length) return true
  return JSON.stringify(previous ?? []) === JSON.stringify(next ?? [])
}

function isEqualNumberLists(previous: number[] | undefined, next: number[] | undefined): boolean {
  if (!previous?.length && !next?.length) return true
  return JSON.stringify(previous ?? []) === JSON.stringify(next ?? [])
}

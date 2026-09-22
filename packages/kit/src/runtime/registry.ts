import { getRootNodesFromInstance } from './component-inspector'
import type {
  AppSnapshot,
  ComponentTreeNodeTag,
  ComponentTreeNodeSnapshot,
} from '../protocol/messages'
import type { AppId, AppRef, ComponentId, InstanceRef, RuntimeEvent, VueTypeMap } from './types'

export interface ComponentRecord {
  id: ComponentId
  uid?: number | string
  appId: AppId
  instance: InstanceRef
  parentId?: ComponentId
  name: string
  file?: string
  renderKey?: string | number
  inactive?: boolean
  isFragment?: boolean
  hidden?: boolean
  tags?: ComponentTreeNodeTag[]
  domOrder?: number[]
  consoleId?: number
  autoOpen?: boolean
  lastMountMs?: number
  lastUpdateMs?: number
  updatedAt: number
}

export interface RefreshComponentTreeOptions {
  maxDepth?: number
  rootComponentId?: ComponentId
  time?: number
}

export interface AppRecord {
  id: AppId
  name: string
  version?: string
  app: AppRef
  vueTypes?: VueTypeMap
  rootInstance?: InstanceRef
  components: Map<ComponentId, ComponentRecord>
  createdAt: number
  updatedAt: number
}

export type { AppSnapshot, ComponentTreeNodeTag } from '../protocol/messages'
export type ComponentSnapshot = ComponentTreeNodeSnapshot

interface ComponentRecordOverrides {
  inactive?: boolean
  tags?: ComponentTreeNodeTag[]
  domOrder?: number[]
  consoleId?: number
  autoOpen?: boolean
}

export interface WalkedComponentChild {
  instance: InstanceRef
  tags?: ComponentTreeNodeTag[]
  inactive?: boolean
}

// Cross-task caches must observe child-list mutations, including equal-length
// reorders. Synchronous traversals can use the cheaper unobserved cache.
export class ComponentDomOrderCache {
  private parents = new WeakMap<Element, Map<Node, number>>()
  private observer?: MutationObserver

  constructor(observe = false) {
    if (observe && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver((records) => this.invalidate(records))
    }
  }

  private invalidate(records: MutationRecord[]): void {
    for (const record of records) this.parents.delete(record.target as Element)
  }

  preparePage(): void {
    if (this.observer) this.invalidate(this.observer.takeRecords())
    else this.parents = new WeakMap()
  }

  dispose(): void {
    this.observer?.disconnect()
    this.parents = new WeakMap()
  }

  indexOf(parent: Element, node: Node): number {
    let indices = this.parents.get(parent)
    if (!indices) {
      indices = new Map()
      const children = parent.childNodes
      for (let index = 0; index < children.length; index++) {
        indices.set(children[index]!, index)
      }
      this.parents.set(parent, indices)
      this.observer?.observe(parent, { childList: true })
    }
    return indices.get(node) ?? -1
  }
}

export class RuntimeRegistry {
  private appIdSeed = 0
  private appByRef = new WeakMap<AppRef, AppRecord>()
  private apps = new Map<AppId, AppRecord>()
  private componentIds = new WeakMap<InstanceRef, ComponentId>()
  private retiredApps = new WeakSet<AppRef>()
  private eventDomOrder?: ComponentDomOrderCache

  private getEventDomOrder(): ComponentDomOrderCache {
    if (!this.eventDomOrder) {
      const cache = new ComponentDomOrderCache(true)
      this.eventDomOrder = cache
      queueMicrotask(() => {
        cache.dispose()
        if (this.eventDomOrder === cache) this.eventDomOrder = undefined
      })
    }
    this.eventDomOrder.preparePage()
    return this.eventDomOrder
  }

  apply(event: RuntimeEvent): AppRecord | ComponentRecord | undefined {
    switch (event.type) {
      case 'app:init':
        return this.addApp(event.app, event.version, event.vueTypes, event.time)
      case 'app:unmount':
        return this.removeApp(event.app)
      case 'component:add':
      case 'component:update':
        return this.ensureComponent(event.appId, event.instance, event.parent, event.time)
      case 'component:remove':
        return this.removeComponent(event.appId, event.instanceId, event.instance)
    }
  }

  addApp(app: AppRef, version: string, vueTypes: VueTypeMap, time: number): AppRecord {
    this.retiredApps.delete(app)
    const existing = this.appByRef.get(app)
    if (existing) {
      existing.version = version
      existing.vueTypes = vueTypes
      existing.updatedAt = time
      return existing
    }

    const id =
      readStringProperty(app, '__VUE_DEVTOOLS_APP_RECORD_ID__') ?? createAppId(this.appIdSeed++)
    const rootInstance =
      readObjectProperty(app, '_instance') ??
      readNestedObjectProperty(app, ['_container', '_vnode', 'component'])
    const record: AppRecord = {
      id,
      name: readAppName(app) ?? `App ${id}`,
      version,
      app,
      vueTypes,
      rootInstance,
      components: new Map(),
      createdAt: time,
      updatedAt: time,
    }

    this.appByRef.set(app, record)
    this.apps.set(id, record)

    if (rootInstance) this.ensureComponent(id, rootInstance, undefined, time, 'root')

    return record
  }

  removeApp(app: AppRef): AppRecord | undefined {
    this.retiredApps.add(app)
    const record = this.appByRef.get(app)
    if (!record) return

    this.appByRef.delete(app)
    this.apps.delete(record.id)
    return record
  }

  isAppRetired(app: AppRef): boolean {
    return this.retiredApps.has(app)
  }

  ensureComponent(
    appId: AppId,
    instance: InstanceRef,
    parent: InstanceRef | undefined,
    time: number,
    forcedUid?: string,
    overrides: ComponentRecordOverrides = {},
    domOrderCache?: ComponentDomOrderCache,
  ): ComponentRecord | undefined {
    // A debounced update may arrive after Vue has already unmounted the instance.
    if (isBeingDestroyed(instance)) return
    const app = this.apps.get(appId)
    if (!app) return

    const domOrder =
      overrides.domOrder ??
      readComponentDomOrder(instance, domOrderCache ?? this.getEventDomOrder())

    const parentId = parent ? this.getComponentId(parent) : undefined
    const id =
      this.getComponentId(instance) ??
      createComponentId(appId, forcedUid ?? readUid(instance) ?? app.components.size)
    this.componentIds.set(instance, id)

    const existing = app.components.get(id)
    if (existing) {
      existing.parentId = parentId
      existing.name = readComponentName(instance)
      existing.file = readComponentFile(instance)
      existing.renderKey = readComponentRenderKey(instance)
      existing.inactive = overrides.inactive ?? isComponentInactive(instance)
      existing.isFragment = isFragmentComponent(instance, app)
      existing.hidden = isComponentHidden(instance)
      existing.tags = readComponentTags(instance, overrides.tags)
      existing.domOrder = domOrder
      existing.consoleId = overrides.consoleId
      existing.autoOpen = overrides.autoOpen
      existing.updatedAt = time
      return existing
    }

    const record: ComponentRecord = {
      id,
      appId,
      uid: readUid(instance),
      instance,
      parentId,
      name: readComponentName(instance),
      file: readComponentFile(instance),
      renderKey: readComponentRenderKey(instance),
      inactive: overrides.inactive ?? isComponentInactive(instance),
      isFragment: isFragmentComponent(instance, app),
      hidden: isComponentHidden(instance),
      tags: readComponentTags(instance, overrides.tags),
      domOrder,
      consoleId: overrides.consoleId,
      autoOpen: overrides.autoOpen,
      updatedAt: time,
    }

    app.components.set(id, record)
    return record
  }

  refreshComponentTree(appId: AppId, options: RefreshComponentTreeOptions = {}): ComponentRecord[] {
    const app = this.apps.get(appId)
    if (!app?.rootInstance) return []

    const rootRecord = options.rootComponentId
      ? app.components.get(options.rootComponentId)
      : undefined
    const rootInstance = rootRecord?.instance ?? app.rootInstance
    const rootParent = rootRecord?.parentId
      ? app.components.get(rootRecord.parentId)?.instance
      : undefined
    const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? Number.POSITIVE_INFINITY))
    const time = options.time ?? Date.now()

    const seen = new Set<InstanceRef>()
    const records: ComponentRecord[] = []
    const domOrder = new ComponentDomOrderCache()

    const walk = (
      instance: InstanceRef,
      parent: InstanceRef | undefined,
      depth: number,
      overrides: ComponentRecordOverrides = {},
    ) => {
      if (seen.has(instance) || isBeingDestroyed(instance)) return
      seen.add(instance)

      const record = this.ensureComponent(app.id, instance, parent, time, undefined, {
        ...overrides,
        domOrder: overrides.domOrder ?? readComponentDomOrder(instance, domOrder),
      })
      if (!record || record.hidden) return
      records.push(record)
      if (depth >= maxDepth) return

      const children = getInternalInstanceChildren(instance)
      const activeChildren = new Set(children.map((child) => child.instance))

      for (const child of children) {
        walk(child.instance, instance, depth + 1, {
          inactive: overrides.inactive || child.inactive,
          tags: child.tags,
        })
      }

      if (isKeepAlive(instance)) {
        for (const cached of getKeepAliveCachedInstances(instance)) {
          if (!activeChildren.has(cached)) walk(cached, instance, depth + 1, { inactive: true })
        }
      }
    }

    walk(rootInstance, rootParent, 0)
    return records
  }

  removeComponent(
    appId: AppId,
    componentId?: ComponentId,
    instance?: InstanceRef,
  ): ComponentRecord | undefined {
    const app = this.apps.get(appId)
    if (!app) return

    const id = componentId ?? (instance ? this.getComponentId(instance) : undefined)
    if (!id) return

    const record = app.components.get(id)
    if (!record) return

    app.components.delete(id)
    return record
  }

  getApp(appId: AppId): AppRecord | undefined {
    return this.apps.get(appId)
  }

  getAppByRef(app: AppRef): AppRecord | undefined {
    return this.appByRef.get(app)
  }

  listApps(): AppRecord[] {
    return [...this.apps.values()]
  }

  resetComponentTracking(): void {
    this.componentIds = new WeakMap<InstanceRef, ComponentId>()
    for (const app of this.apps.values()) {
      app.components.clear()
      if (app.rootInstance)
        this.ensureComponent(app.id, app.rootInstance, undefined, Date.now(), 'root')
    }
  }

  getComponentId(instance: InstanceRef): ComponentId | undefined {
    return this.componentIds.get(instance)
  }

  getComponent(componentId: ComponentId, appId?: AppId): ComponentRecord | undefined {
    if (appId) return this.apps.get(appId)?.components.get(componentId)

    for (const app of this.apps.values()) {
      const record = app.components.get(componentId)
      if (record) return record
    }
  }

  getComponentDepth(record: ComponentRecord): number {
    const app = this.apps.get(record.appId)
    if (!app) return 0

    let depth = 0
    let parentId = record.parentId
    const seen = new Set<ComponentId>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      depth += 1
      parentId = app.components.get(parentId)?.parentId
    }
    return depth
  }

  getComponentChildCount(record: ComponentRecord): number {
    const children = getInternalInstanceChildren(record.instance).map((child) => child.instance)
    const childInstances = new Set(children)
    if (isKeepAlive(record.instance)) {
      for (const cached of getKeepAliveCachedInstances(record.instance)) childInstances.add(cached)
    }
    return childInstances.size
  }

  getComponentChildren(record: ComponentRecord): WalkedComponentChild[] {
    const children = getInternalInstanceChildren(record.instance)
    if (isKeepAlive(record.instance)) {
      const active = new Set(children.map((child) => child.instance))
      for (const instance of getKeepAliveCachedInstances(record.instance)) {
        if (!active.has(instance)) children.push({ instance, inactive: true })
      }
    }
    return children
  }

  refreshChild(
    parent: ComponentRecord,
    child: WalkedComponentChild,
    cache: ComponentDomOrderCache,
  ): ComponentRecord | undefined {
    const currentParent = readObjectProperty(child.instance, 'parent')
    if (currentParent && currentParent !== parent.instance) return
    return this.ensureComponent(
      parent.appId,
      child.instance,
      parent.instance,
      Date.now(),
      undefined,
      {
        inactive: parent.inactive || child.inactive,
        tags: child.tags,
      },
      cache,
    )
  }

  toAppSnapshot(record: AppRecord): AppSnapshot {
    return {
      id: record.id,
      name: record.name,
      version: record.version,
      componentCount: record.components.size,
    }
  }

  toComponentSnapshot(record: ComponentRecord): ComponentSnapshot {
    return {
      id: record.id,
      appId: record.appId,
      parentId: record.parentId,
      name: record.name,
      file: record.file,
      renderKey: record.renderKey,
      inactive: record.inactive,
      isFragment: record.isFragment,
      tags: record.tags,
      domOrder: record.domOrder,
      consoleId: record.consoleId,
      autoOpen: record.autoOpen,
      updatedAt: record.updatedAt,
      childCount: this.getComponentChildCount(record),
    }
  }
}

function createAppId(seed: number): AppId {
  return `app:${seed}`
}

function createComponentId(appId: AppId, uid: string | number): ComponentId {
  return `${appId}:${uid}`
}

function readUid(value: object): string | number | undefined {
  const uid = readUnknownProperty(value, 'uid')
  return typeof uid === 'string' || typeof uid === 'number' ? uid : undefined
}

function readAppName(app: object): string | undefined {
  const component = readObjectProperty(app, '_component')
  return component ? readStringProperty(component, 'name') : undefined
}

function readComponentName(instance: object): string {
  const type = readObjectProperty(instance, 'type')
  if (type) {
    const name =
      readStringProperty(type, 'displayName') ??
      readStringProperty(type, 'name') ??
      readStringProperty(type, '__name') ??
      readStringProperty(type, '__VUE_DEVTOOLS_COMPONENT_GUSSED_NAME__')
    if (name) return name
  }

  return 'Anonymous Component'
}

function readComponentFile(instance: object): string | undefined {
  const type = readObjectProperty(instance, 'type')
  return type ? readStringProperty(type, '__file') : undefined
}

function readComponentRenderKey(instance: object): string | number | undefined {
  const vnode = readObjectProperty(instance, 'vnode')
  if (!vnode) return

  const value = readUnknownProperty(vnode, 'key')
  if (value == null) return
  if (typeof value === 'number') return value
  if (typeof value === 'string') return `'${value}'`
  if (Array.isArray(value)) return 'Array'
  return 'Object'
}

function isComponentInactive(instance: object): boolean {
  let current: object | undefined = instance

  while (current) {
    if (readBooleanProperty(current, 'isDeactivated') === true) return true
    current = readObjectProperty(current, 'parent')
  }

  return false
}

function isFragmentComponent(instance: object, app: AppRecord): boolean {
  const subtree = readObjectProperty(instance, 'subTree')
  if (!subtree) return false
  return readUnknownProperty(subtree, 'type') === app.vueTypes?.Fragment
}

function isComponentHidden(instance: object): boolean {
  const type = readComponentType(instance)
  const devtools = type ? readObjectProperty(type, 'devtools') : undefined
  return devtools ? readBooleanProperty(devtools, 'hide') === true : false
}

function readComponentTags(
  instance: object,
  extraTags: ComponentTreeNodeTag[] = [],
): ComponentTreeNodeTag[] | undefined {
  const tags: ComponentTreeNodeTag[] = []
  const type = readComponentType(instance)

  if (typeof type === 'function') {
    tags.push({
      label: 'functional',
      textColor: 0x555555,
      backgroundColor: 0xeeeeee,
    })
  }

  const suspense = readObjectProperty(instance, 'suspense')
  const suspenseKey = suspense ? readStringProperty(suspense, 'suspenseKey') : undefined
  if (suspenseKey) {
    tags.push({
      label: suspenseKey,
      textColor: 0xffffff,
      backgroundColor: 0xe492e4,
    })
  }

  for (const tag of extraTags) {
    if (!tags.some((current) => current.label === tag.label)) tags.push(tag)
  }

  return tags.length ? tags : undefined
}

function readComponentDomOrder(
  instance: object,
  cache?: ComponentDomOrderCache,
): number[] | undefined {
  const firstNode = getRootNodesFromInstance(instance).find(isInspectableNode)
  const firstElement = toElement(firstNode)
  if (!firstElement?.parentElement) return [-1]

  const parentInstance = readObjectProperty(instance, 'parent')
  const parentRootElements = parentInstance
    ? getRootNodesFromInstance(parentInstance).map(toElement).filter(isElement)
    : []
  const indexList: number[] = []
  let element: Element | null = firstElement

  do {
    const parentElement: Element | null = element.parentElement
    if (!parentElement) break

    indexList.push(
      cache
        ? cache.indexOf(parentElement, element)
        : Array.from(parentElement.childNodes).indexOf(element),
    )
    element = parentElement
  } while (
    element?.parentElement &&
    parentRootElements.length > 0 &&
    !parentRootElements.includes(element)
  )

  return indexList.reverse()
}

function getInternalInstanceChildren(instance: object): WalkedComponentChild[] {
  const subtree = readObjectProperty(instance, 'subTree')
  return subtree ? getInternalInstanceChildrenFromVNode(subtree) : []
}

function getInternalInstanceChildrenFromVNode(
  vnode: object,
  tags: ComponentTreeNodeTag[] = [],
): WalkedComponentChild[] {
  const component = readObjectProperty(vnode, 'component')
  if (component && !isBeingDestroyed(component) && !isComponentHidden(component)) {
    return [{ instance: component, tags }]
  }

  const suspense = readObjectProperty(vnode, 'suspense')
  if (suspense) {
    const activeBranch = readObjectProperty(suspense, 'activeBranch')
    if (activeBranch) {
      const suspenseKey =
        readBooleanProperty(suspense, 'isInFallback') === true
          ? 'suspense fallback'
          : 'suspense default'
      return getInternalInstanceChildrenFromVNode(activeBranch, [
        ...tags,
        {
          label: suspenseKey,
          textColor: 0xffffff,
          backgroundColor: 0xe492e4,
        },
      ])
    }
  }

  const children = readUnknownProperty(vnode, 'children')
  if (!Array.isArray(children)) return []

  return children.flatMap((child) =>
    child != null && typeof child === 'object'
      ? getInternalInstanceChildrenFromVNode(child, tags)
      : [],
  )
}

function isKeepAlive(instance: object): boolean {
  return (
    readBooleanProperty(readObjectProperty(instance, 'type') ?? {}, '__isKeepAlive') === true &&
    readUnknownProperty(instance, '__v_cache') instanceof Map
  )
}

function getKeepAliveCachedInstances(instance: object): InstanceRef[] {
  const cache = readUnknownProperty(instance, '__v_cache')
  if (!(cache instanceof Map)) return []

  return Array.from(cache.values())
    .map((vnode) =>
      vnode != null && typeof vnode === 'object'
        ? readObjectProperty(vnode, 'component')
        : undefined,
    )
    .filter((component): component is InstanceRef => !!component)
}

function isBeingDestroyed(instance: object): boolean {
  return (
    readBooleanProperty(instance, 'isUnmounted') === true ||
    readBooleanProperty(instance, 'isUnmounting') === true ||
    readBooleanProperty(instance, '_isBeingDestroyed') === true
  )
}

function isInspectableNode(value: Node | undefined): value is Node {
  return (
    typeof Node !== 'undefined' &&
    !!value &&
    (value.nodeType === Node.ELEMENT_NODE || value.nodeType === Node.TEXT_NODE)
  )
}

function toElement(node: Node | undefined): Element | undefined {
  if (!node) return
  if (typeof Node === 'undefined') return
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element
  return node.nodeType === Node.TEXT_NODE ? (node.parentElement ?? undefined) : undefined
}

function isElement(value: Element | undefined): value is Element {
  return !!value
}

function readComponentType(instance: object): unknown {
  return readUnknownProperty(instance, 'type')
}

function readStringProperty(target: object, key: string): string | undefined {
  const value = readUnknownProperty(target, key)
  return typeof value === 'string' ? value : undefined
}

function readObjectProperty(target: object, key: string): object | undefined {
  const value = readUnknownProperty(target, key)
  return value != null && typeof value === 'object' ? value : undefined
}

function readBooleanProperty(target: object, key: string): boolean | undefined {
  const value = readUnknownProperty(target, key)
  return typeof value === 'boolean' ? value : undefined
}

function readNestedObjectProperty(target: object, keys: string[]): object | undefined {
  let current: object | undefined = target
  for (const key of keys) {
    if (!current) return
    current = readObjectProperty(current, key)
  }
  return current
}

function readUnknownProperty(target: object, key: string): unknown {
  return (target as Record<string, unknown>)[key]
}

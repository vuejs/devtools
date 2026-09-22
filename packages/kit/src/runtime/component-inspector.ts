import type { ComponentRecord } from './registry'
import type { AppId, ComponentId, InstanceRef } from './types'
import type { DevtoolsRuntime } from './runtime'

export interface ComponentInspectionResult {
  appId: AppId
  componentId: ComponentId
}

interface ActiveInspection {
  cancel(): void
}

export interface ComponentBounds {
  left: number
  top: number
  width: number
  height: number
}

export type ComponentInspectorDockRestore = () => Promise<void> | void

export interface ComponentInspectorDockController {
  closeForComponentInspection():
    | Promise<ComponentInspectorDockRestore | undefined>
    | ComponentInspectorDockRestore
    | undefined
}

const OVERLAY_ID = '__vue-devtools-component-inspector__'
const CARD_ID = '__vue-devtools-component-inspector__card__'
const NAME_ID = '__vue-devtools-component-inspector__name__'
const SIZE_ID = '__vue-devtools-component-inspector__size__'
const INSPECT_DOM_TARGET = '__VUE_DEVTOOLS_INSPECT_DOM_TARGET__'
const MAX_EXPOSED_INSTANCES = 5

let activeInspection: ActiveInspection | undefined
let dockController: ComponentInspectorDockController | undefined
const exposedInstances: InstanceRef[] = []

export function setComponentInspectorDockController(
  controller: ComponentInspectorDockController | undefined,
): void {
  dockController = controller
}

export function inspectComponentInPage(
  runtime: DevtoolsRuntime,
): Promise<ComponentInspectionResult | undefined> {
  const context = getBrowserContext()
  if (!context) return Promise.resolve(undefined)

  const inspectedWindow = context.window
  const inspectedDocument = context.document

  cancelComponentInspection()

  return new Promise((resolve) => {
    let restoreDockPanel: (() => Promise<void>) | undefined
    let settled = false

    async function finish(result?: ComponentInspectionResult) {
      if (settled) return
      settled = true

      inspectedWindow.removeEventListener('mouseover', onMouseOver, true)
      inspectedWindow.removeEventListener('click', onClick, true)
      inspectedWindow.removeEventListener('keydown', onKeyDown, true)
      removeOverlay(inspectedDocument)

      if (activeInspection?.cancel === cancel) activeInspection = undefined
      await restoreDockPanelSafely(restoreDockPanel)
      resolve(result)
    }

    function cancel() {
      void finish()
    }

    function onMouseOver(event: MouseEvent) {
      const record = findComponentRecord(runtime, event)
      if (!record) {
        removeOverlay(inspectedDocument)
        return
      }
      highlightComponent(inspectedDocument, record)
    }

    function onClick(event: MouseEvent) {
      const record = findComponentRecord(runtime, event)
      if (!record) return

      event.preventDefault()
      event.stopPropagation()
      void finish({ appId: record.appId, componentId: record.id })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      event.preventDefault()
      void finish()
    }

    activeInspection = { cancel }

    // Capture so a parent `@mouseover.stop` cannot swallow the locator (issue-487).
    inspectedWindow.addEventListener('mouseover', onMouseOver, true)
    inspectedWindow.addEventListener('click', onClick, true)
    inspectedWindow.addEventListener('keydown', onKeyDown, true)
    void closeDockPanelForInspection()
      .then((restore) => {
        if (settled) {
          void restoreDockPanelSafely(restore)
          return
        }

        restoreDockPanel = restore
      })
      .catch(() => {})
  })
}

export function cancelComponentInspection(): void {
  activeInspection?.cancel()
  activeInspection = undefined
}

export function isComponentInspectionActive(): boolean {
  return activeInspection != null
}

export function getComponentRecordBounds(record: ComponentRecord): ComponentBounds | undefined {
  return getInstanceBounds(record.instance)
}

export function highlightComponentRecord(record: ComponentRecord): boolean {
  const context = getBrowserContext()
  if (!context) return false
  return highlightComponent(context.document, record)
}

export function unhighlightComponent(): void {
  const context = getBrowserContext()
  if (!context) return
  removeOverlay(context.document)
}

export function scrollToComponentRecord(record: ComponentRecord): boolean {
  const target = getInspectableRootNode(record.instance)
  if (!target) return false

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
  })
  highlightComponentRecord(record)
  return true
}

export function exposeComponentDomTarget(record: ComponentRecord): boolean {
  const context = getBrowserContext()
  if (!context) return false

  const target = getInspectableRootNode(record.instance)
  if (!target) return false

  ;(context.window as unknown as Record<string, unknown>)[INSPECT_DOM_TARGET] = target
  return true
}

export function getComponentRenderCode(record: ComponentRecord): string | undefined {
  const instance = record.instance as Record<string, unknown>
  const type = readObjectProperty(record.instance, 'type')
  const render =
    readUnknownProperty(instance, 'render') ??
    (type ? readUnknownProperty(type, 'render') : undefined)
  if (typeof render === 'function') return normalizeFunctionIndentation(render.toString())

  const setup = type ? readUnknownProperty(type, 'setup') : undefined
  if (typeof setup === 'function') return normalizeFunctionIndentation(setup.toString())
}

function normalizeFunctionIndentation(source: string): string {
  const lines = source.split('\n')
  if (lines.length < 2) return source

  const indents = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.match(/^[\t ]*/)?.[0] ?? '')
  if (!indents.length) return source

  let commonIndent = indents[0]!
  for (const indent of indents.slice(1)) {
    while (commonIndent && !indent.startsWith(commonIndent))
      commonIndent = commonIndent.slice(0, -1)
  }
  if (!commonIndent) return source

  return [
    lines[0],
    ...lines
      .slice(1)
      .map((line) => (line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line)),
  ].join('\n')
}

export function exposeComponentInstance(record: ComponentRecord): void {
  const context = getBrowserContext()
  if (!context) return

  const target = context.window as unknown as Record<string, unknown>
  target.$vm = record.instance

  if (exposedInstances[0] === record.instance) return

  exposedInstances.unshift(record.instance)
  if (exposedInstances.length > MAX_EXPOSED_INSTANCES)
    exposedInstances.splice(MAX_EXPOSED_INSTANCES)

  exposedInstances.forEach((instance, index) => {
    target[`$vm${index}`] = instance
  })
}

let globalValueSeed = 0

/**
 * Exposes the real runtime value (not its serialized preview) on the page as
 * a stable `$tempN` global, mirroring the browser console convention. Returns
 * the variable name so the UI can tell the user where to find it.
 */
export function exposeValueAsGlobal(value: unknown): string | undefined {
  const context = getBrowserContext()
  if (!context) return

  const target = context.window as unknown as Record<string, unknown>
  const name = `$temp${++globalValueSeed}`
  target[name] = value
  target.$temp = value
  return name
}

function findComponentRecord(
  runtime: DevtoolsRuntime,
  event: MouseEvent,
): ComponentRecord | undefined {
  const targets = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]

  for (const target of targets) {
    const record = findComponentRecordFromTarget(runtime, target)
    if (record) return record
  }

  return findComponentRecordFromTarget(runtime, event.target)
}

function findComponentRecordFromTarget(
  runtime: DevtoolsRuntime,
  target: EventTarget | null,
): ComponentRecord | undefined {
  let node = isNode(target) ? target : undefined

  while (node) {
    const record = findComponentRecordFromInstance(
      runtime,
      readObjectProperty(node, '__vueParentComponent'),
    )
    if (record) return record

    node = node.parentNode ?? undefined
  }
}

function findComponentRecordFromInstance(
  runtime: DevtoolsRuntime,
  instance: unknown,
): ComponentRecord | undefined {
  let current = isObject(instance) ? instance : undefined
  const missing: InstanceRef[] = []
  const visited = new Set<object>()

  while (current && !visited.has(current)) {
    visited.add(current)
    const componentId = runtime.registry.getComponentId(current)
    let record = componentId ? runtime.registry.getComponent(componentId) : undefined
    if (record) {
      for (const child of missing.reverse()) {
        const next = runtime.registry.ensureComponent(
          record.appId,
          child,
          record.instance,
          Date.now(),
        )
        if (!next || next.hidden) return record
        record = next
      }
      return record
    }

    missing.push(current)
    current = readObjectProperty(current, 'parent')
  }
}

function highlightComponent(document: Document, record: ComponentRecord): boolean {
  const bounds = getInstanceBounds(record.instance)
  if (!bounds || (!bounds.width && !bounds.height)) return false

  const overlay = getOrCreateOverlay(document)
  const card = document.getElementById(CARD_ID)
  const name = document.getElementById(NAME_ID)
  const size = document.getElementById(SIZE_ID)

  Object.assign(overlay.style, {
    display: 'block',
    left: `${round(bounds.left)}px`,
    top: `${round(bounds.top)}px`,
    width: `${round(bounds.width)}px`,
    height: `${round(bounds.height)}px`,
  } satisfies Partial<CSSStyleDeclaration>)

  if (card) {
    Object.assign(card.style, {
      top: bounds.top < 35 ? '0' : '-35px',
    } satisfies Partial<CSSStyleDeclaration>)
  }

  if (name) name.textContent = `<${record.name}>  `
  if (size) size.textContent = `${round(bounds.width)} x ${round(bounds.height)}`
  return true
}

function getOrCreateOverlay(document: Document): HTMLElement {
  const current = document.getElementById(OVERLAY_ID)
  if (current) return current

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  Object.assign(overlay.style, {
    zIndex: '2147483640',
    position: 'fixed',
    inset: 'auto',
    display: 'block',
    margin: '0',
    overflow: 'visible',
    padding: '0',
    backgroundColor: '#42b88325',
    border: '1px solid #42b88350',
    borderRadius: '5px',
    transition: 'all 0.1s ease-in',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>)

  const card = document.createElement('span')
  card.id = CARD_ID
  Object.assign(card.style, {
    fontFamily: 'Arial, Helvetica, sans-serif',
    padding: '5px 8px',
    borderRadius: '4px',
    textAlign: 'left',
    position: 'absolute',
    left: '0',
    color: '#e9e9e9',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '24px',
    backgroundColor: '#42b883',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  } satisfies Partial<CSSStyleDeclaration>)

  const name = document.createElement('span')
  name.id = NAME_ID

  const size = document.createElement('i')
  size.id = SIZE_ID
  Object.assign(size.style, {
    display: 'inline-block',
    fontWeight: '400',
    fontStyle: 'normal',
    fontSize: '12px',
    opacity: '0.7',
  } satisfies Partial<CSSStyleDeclaration>)

  card.append(name, size)
  overlay.append(card)
  document.body.append(overlay)

  return overlay
}

function removeOverlay(document: Document) {
  document.getElementById(OVERLAY_ID)?.remove()
}

function getInstanceBounds(instance: InstanceRef): ComponentBounds | undefined {
  const rects = getRootNodesFromInstance(instance)
    .map(getNodeRect)
    .filter((rect): rect is ComponentBounds => !!rect)

  if (!rects.length) return

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.left + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height))

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

export function getRootNodesFromInstance(instance: InstanceRef, seen = new Set<object>()): Node[] {
  if (seen.has(instance)) return []
  seen.add(instance)

  const subtree = readObjectProperty(instance, 'subTree') ?? readObjectProperty(instance, 'vnode')
  return subtree ? getRootNodesFromVNode(subtree, seen) : []
}

function getInspectableRootNode(instance: InstanceRef): Element | undefined {
  for (const node of getRootNodesFromInstance(instance)) {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element
    if (node.nodeType === Node.TEXT_NODE && node.parentElement) return node.parentElement
  }
}

function getRootNodesFromVNode(vnode: object, seen: Set<object>): Node[] {
  if (seen.has(vnode)) return []
  seen.add(vnode)

  const component = readObjectProperty(vnode, 'component')
  if (component) return getRootNodesFromInstance(component, seen)

  const suspense = readObjectProperty(vnode, 'suspense')
  const activeBranch = suspense ? readObjectProperty(suspense, 'activeBranch') : undefined
  if (activeBranch) return getRootNodesFromVNode(activeBranch, seen)

  const el = readUnknownProperty(vnode, 'el')
  if (isNode(el) && isVisibleRootNode(el)) return [el]

  const children = readUnknownProperty(vnode, 'children')
  if (!Array.isArray(children)) return isNode(el) ? [el] : []

  return children.flatMap((child) => (isObject(child) ? getRootNodesFromVNode(child, seen) : []))
}

function getNodeRect(node: Node): ComponentBounds | undefined {
  if (node.nodeType === Node.ELEMENT_NODE && 'getBoundingClientRect' in node) {
    const rect = (node as Element).getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  if (node.nodeType === Node.TEXT_NODE && node.ownerDocument) {
    const range = node.ownerDocument.createRange()
    range.selectNode(node)
    const rect = range.getBoundingClientRect()
    range.detach()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }
}

function isVisibleRootNode(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE
}

function getBrowserContext(): { window: Window; document: Document } | undefined {
  if (typeof window === 'undefined' || !window.document) return
  return {
    window,
    document: window.document,
  }
}

async function closeDockPanelForInspection(): Promise<(() => Promise<void>) | undefined> {
  const restore = await dockController?.closeForComponentInspection()
  if (!restore) return
  return async () => {
    await restore()
  }
}

async function restoreDockPanelSafely(restore: ComponentInspectorDockRestore | undefined) {
  if (!restore) return
  try {
    await restore()
  } catch {
    // Restoring the dock is best-effort; inspect result delivery should not be blocked by it.
  }
}

function isNode(value: unknown): value is Node {
  return typeof Node !== 'undefined' && value instanceof Node
}

function isObject(value: unknown): value is object {
  return value != null && typeof value === 'object'
}

function readObjectProperty(value: object, key: string): object | undefined {
  const property = readUnknownProperty(value, key)
  return isObject(property) ? property : undefined
}

function readUnknownProperty(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

import type { VNode } from 'vue'

const KEY_IGNORE = 'data-v-inspector-ignore'
const KEY_GLOBAL = '__vue_tracer__'

export type PositionInfo = [source: string, line: number, column: number]

interface Store {
  hasData: boolean
  vnodeToPos: WeakMap<object, PositionInfo>
  fileToVNode: Map<string, WeakSet<object>>
  posToVNode: Map<string, Map<number, Map<number, WeakSet<object>>>>
}

// Share records across copies of the client runtime.
const existingStore = (globalThis as typeof globalThis & { [KEY_GLOBAL]?: Store })[KEY_GLOBAL]
const _store: Store = existingStore ?? {
  hasData: false,
  vnodeToPos: new WeakMap(),
  fileToVNode: new Map(),
  posToVNode: new Map(),
}
if (!existingStore) {
  Object.defineProperty(globalThis, KEY_GLOBAL, {
    value: _store,
    configurable: true,
    enumerable: false,
  })
}

/**
 * @internal
 */
export function getInternalStore(): Store {
  return _store
}

/**
 * @internal
 */
export function recordPosition(source: string, line: number, column: number, node: VNode): VNode {
  if (!node || typeof node === 'string' || typeof node === 'number') return node

  if (!_store.hasData) _store.hasData = true

  const props = (node.props ||= {})
  _store.vnodeToPos.set(props, [source, line, column])

  if (!_store.fileToVNode.has(source)) _store.fileToVNode.set(source, new WeakSet())
  _store.fileToVNode.get(source)!.add(props)

  if (!_store.posToVNode.has(source)) _store.posToVNode.set(source, new Map())
  const lineMap = _store.posToVNode.get(source)!
  if (!lineMap.has(line)) lineMap.set(line, new Map())
  const columnMap = lineMap.get(line)!
  if (!columnMap.has(column)) columnMap.set(column, new WeakSet())
  columnMap.get(column)!.add(props)

  return node
}

function getPositionFromVNode(node: VNode): PositionInfo | undefined {
  const props = node?.props
  if (props) return _store.vnodeToPos.get(props)
}

export class ElementTraceInfo {
  pos: PositionInfo
  vnode: VNode | undefined
  el: Element | undefined

  constructor(pos: PositionInfo, el?: Element, vnode?: VNode) {
    this.vnode = vnode
    this.pos = pos
    this.el = el
  }

  get filepath(): string {
    return this.pos[0]
  }

  get fullpath(): string {
    let path = this.pos[0]
    if (this.pos[1]) {
      path += `:${this.pos[1]}`
      if (this.pos[2]) path += `:${this.pos[2]}`
    }
    return path
  }

  get rect(): DOMRect | undefined {
    return this.el?.getBoundingClientRect()
  }

  getElementsSameFile(): Element[] | undefined {
    const pos = this.pos
    const fileVNodeSet = _store.fileToVNode.get(pos[0])
    if (!fileVNodeSet) return
    // TODO: any way to improve the performance?
    return Array.from(document.querySelectorAll('*')).filter(
      (e) =>
        e !== this.el && (e as any).__vnode?.props && fileVNodeSet.has((e as any).__vnode?.props),
    )
  }

  getParent(): ElementTraceInfo | undefined {
    const parentVNode = (this.vnode as any)?.parent
    const parentEl = this.el?.parentElement
    return findTraceFromVNode(parentVNode) ?? findTraceFromElement(parentEl)
  }

  getElementsSamePosition(): Element[] | undefined {
    if (typeof this.vnode?.type !== 'string') return
    const pos = this.pos
    const posVNodeSet = _store.posToVNode.get(pos[0])?.get(pos[1])?.get(pos[2])
    if (!posVNodeSet) return
    // TODO: any way to improve the performance?
    return Array.from(document.querySelectorAll(this.vnode.type)).filter(
      (e) =>
        e !== this.el && (e as any).__vnode?.props && posVNodeSet.has((e as any).__vnode?.props),
    )
  }
}

export function findTraceFromElement(el?: Element | null): ElementTraceInfo | undefined {
  if (!el) return
  const vnode: VNode | undefined = (el as any).__vnode
  return findTraceFromVNode(vnode, el)
}

export function findTraceFromVNode(vnode?: VNode, el?: Element): ElementTraceInfo | undefined {
  if (!vnode) return
  const pos = getPositionFromVNode(vnode)
  if (!pos) return
  return new ElementTraceInfo(pos, (el ?? vnode?.el ?? undefined) as any, vnode)
}

export function findTraceAtPointer(e: { x: number; y: number }): ElementTraceInfo | undefined {
  let elements = document.elementsFromPoint(e.x, e.y)
  const ignoreIndex = elements.findIndex((node) => node?.hasAttribute?.(KEY_IGNORE))
  if (ignoreIndex !== -1) elements = elements.slice(ignoreIndex)
  for (const el of elements) {
    const match = findTraceFromElement(el as Element)
    if (match) return match
  }
}

export function hasData(): boolean {
  return _store.hasData
}

/** @internal */
export function findElementPosition(el: Element): { el: Element; pos: PositionInfo } | undefined {
  for (let current: Element | null = el; current; current = current.parentElement) {
    const position = findTraceFromElement(current)?.pos
    if (position) return { el: current, pos: position }
  }
}

export function getElementPosition(el: Element): PositionInfo | undefined {
  return findElementPosition(el)?.pos
}

// The kit consumes only this bridge, independently of the tracing implementation.
Object.defineProperty(globalThis, '__VUE_DEVTOOLS_TRACER__', {
  value: { getElementPosition },
  configurable: true,
  enumerable: false,
})

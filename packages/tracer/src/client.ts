import type { VNode } from 'vue'

const KEY_IGNORE = 'data-v-inspector-ignore'
const KEY_GLOBAL = '__vue_tracer__'
const KEY_SOURCE = 'data-v-source'

export type PositionInfo = [source: string, line: number, column: number]

interface Store {
  hasData: boolean
  vnodeToPos: WeakMap<object, PositionInfo>
  fileToVNode: Map<string, WeakSet<object>>
  fileToTags?: Map<string, Set<string> | null>
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

// A prior runtime copy may already have records without tag metadata. Preserve
// its queries with the broad fallback until those files are reloaded.
const fileToTags = (_store.fileToTags ||= new Map(
  Array.from(_store.fileToVNode.keys(), (source) => [source, null]),
))

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
  if (!fileToTags.has(source)) fileToTags.set(source, new Set())
  if (typeof node.type === 'string') fileToTags.get(source)?.add(node.type)
  // Hydration can temporarily expose async components, and static VNodes can
  // own native roots. Ordinary components, Fragments and Teleports do not.
  // A non-async setup returning a Promise may be untraceable until hydration resolves.
  else if (
    node.type === Symbol.for('v-stc') ||
    (typeof node.type === 'object' &&
      ('__asyncLoader' in node.type ||
        ('setup' in node.type && node.type.setup?.constructor.name === 'AsyncFunction')))
  )
    fileToTags.set(source, null)

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
      if (this.pos[2] !== undefined) path += `:${this.pos[2]}`
    }
    return path
  }

  get rect(): DOMRect | undefined {
    return this.el?.getBoundingClientRect()
  }

  getElementsSameFile(): Element[] | undefined {
    if (typeof document === 'undefined') return
    const candidates = new Set(
      document.querySelectorAll(`[${KEY_SOURCE}^="${CSS.escape(`${this.filepath}:`)}"]`),
    )
    const fileVNodeSet = _store.fileToVNode.get(this.filepath)
    if (fileVNodeSet) {
      // Props survive cloned VNodes, whereas the original VNode's el may only
      // point at one instance. Query known tags to retain all live instances.
      const tags = fileToTags.get(this.filepath)
      const selector = tags == null ? '*' : Array.from(tags, (tag) => CSS.escape(tag)).join(',')
      for (const el of selector ? document.querySelectorAll(selector) : []) {
        const props = (el as Element & { __vnode?: VNode }).__vnode?.props
        if (props && fileVNodeSet.has(props)) candidates.add(el)
      }
    }
    return Array.from(candidates).filter(
      (el) => el !== this.el && findTraceFromElement(el)?.filepath === this.filepath,
    )
  }

  getParent(): ElementTraceInfo | undefined {
    const parentVNode = (this.vnode as any)?.parent
    const parentEl = this.el?.parentElement
    return findTraceFromVNode(parentVNode) ?? findTraceFromElement(parentEl)
  }

  getElementsSamePosition(): Element[] | undefined {
    if (typeof document === 'undefined') return
    const tag =
      this.el?.localName ?? (typeof this.vnode?.type === 'string' ? this.vnode.type : undefined)
    if (!tag) return
    const positionRecords = _store.posToVNode.get(this.pos[0])?.get(this.pos[1])?.get(this.pos[2])
    const selector = `${CSS.escape(tag)}${positionRecords ? '' : `[${KEY_SOURCE}]`}`
    return Array.from(document.querySelectorAll(selector)).filter((el) => {
      if (el === this.el) return false
      const pos = findTraceFromElement(el)?.pos
      return pos?.[0] === this.pos[0] && pos[1] === this.pos[1] && pos[2] === this.pos[2]
    })
  }
}

export function findTraceFromElement(el?: Element | null): ElementTraceInfo | undefined {
  if (!el) return
  const vnode: VNode | undefined = (el as any).__vnode
  const trace = findTraceFromVNode(vnode, el)
  if (trace) return trace
  const pos = getPositionFromAttribute(el)
  if (pos) return new ElementTraceInfo(pos, el)
}

function getPositionFromAttribute(el: Element): PositionInfo | undefined {
  const match = el.getAttribute(KEY_SOURCE)?.match(/^(.*):(\d+):(\d+)$/s)
  if (!match || !match[1]!.trim()) return
  const line = Number(match[2])
  const column = Number(match[3])
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column)) return
  return [match[1]!, line, column]
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
  return (
    _store.hasData ||
    (typeof document !== 'undefined' &&
      Array.from(document.querySelectorAll(`[${KEY_SOURCE}]`)).some((el) =>
        getPositionFromAttribute(el),
      ))
  )
}

/** @internal */
export function findElementPosition(el: Element): { el: Element; pos: PositionInfo } | undefined {
  for (
    let current: Element | null = el;
    current;
    current =
      current.parentElement ??
      (current.parentNode instanceof ShadowRoot ? current.parentNode.host : null)
  ) {
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

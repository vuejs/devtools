export type ValueHandle = string

export interface ValueHandleEntry {
  handle: ValueHandle
  value: object
}

export interface ValueHandleRegistryOptions {
  maxHandles?: number
}

const DEFAULT_MAX_HANDLES = 10_000

export class ValueHandleRegistry {
  private seed = 0
  private objectToHandle = new WeakMap<object, ValueHandle>()
  private handleToObject = new Map<ValueHandle, object>()
  private handleToScope = new Map<ValueHandle, string>()
  private scopeToHandles = new Map<string, Set<ValueHandle>>()
  private maxHandles: number

  constructor(options: ValueHandleRegistryOptions = {}) {
    this.maxHandles = normalizeMaxHandles(options.maxHandles)
  }

  get size(): number {
    return this.handleToObject.size
  }

  setMaxHandles(maxHandles: number): void {
    this.maxHandles = normalizeMaxHandles(maxHandles)
    this.evictOverflow()
  }

  getOrCreate(value: object, scope?: string): ValueHandle {
    const existing = this.objectToHandle.get(value)
    if (existing && this.handleToObject.has(existing)) return existing

    const handle = `value:${this.seed++}`
    this.objectToHandle.set(value, handle)
    this.handleToObject.set(handle, value)
    if (scope) {
      this.handleToScope.set(handle, scope)
      const handles = this.scopeToHandles.get(scope) ?? new Set()
      handles.add(handle)
      this.scopeToHandles.set(scope, handles)
    }
    this.evictOverflow()
    return handle
  }

  get(handle: ValueHandle): object | undefined {
    return this.handleToObject.get(handle)
  }

  getScope(handle: ValueHandle): string | undefined {
    return this.handleToScope.get(handle)
  }

  delete(handle: ValueHandle): void {
    const value = this.handleToObject.get(handle)
    if (value) this.objectToHandle.delete(value)
    this.handleToObject.delete(handle)

    const scope = this.handleToScope.get(handle)
    if (scope) {
      this.handleToScope.delete(handle)
      const handles = this.scopeToHandles.get(scope)
      handles?.delete(handle)
      if (handles && handles.size === 0) this.scopeToHandles.delete(scope)
    }
  }

  releaseScope(scope: string): number {
    const handles = this.scopeToHandles.get(scope)
    if (!handles) return 0

    this.scopeToHandles.delete(scope)
    let released = 0
    for (const handle of handles) {
      const value = this.handleToObject.get(handle)
      if (value) this.objectToHandle.delete(value)
      this.handleToObject.delete(handle)
      this.handleToScope.delete(handle)
      released++
    }
    return released
  }

  clear(): void {
    this.handleToObject.clear()
    this.handleToScope.clear()
    this.scopeToHandles.clear()
    this.objectToHandle = new WeakMap()
    this.seed = 0
  }

  private evictOverflow(): void {
    while (this.handleToObject.size > this.maxHandles) {
      const oldest = this.handleToObject.keys().next().value
      if (oldest == null) return
      this.delete(oldest)
    }
  }
}

function normalizeMaxHandles(value: number | undefined): number {
  if (!Number.isFinite(value) || value == null) return DEFAULT_MAX_HANDLES
  return Math.max(1, Math.floor(value))
}

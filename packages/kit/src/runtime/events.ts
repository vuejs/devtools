import type { RuntimeDomainEvent, RuntimeEventHandler, RuntimeDomainEventType } from './types'

export interface RuntimeEventLog {
  dispatch(event: RuntimeDomainEvent): void
  subscribe(type: '*', handler: RuntimeEventHandler): () => void
  subscribe<Type extends RuntimeDomainEventType>(
    type: Type,
    handler: RuntimeEventHandler<Extract<RuntimeDomainEvent, { type: Type }>>,
  ): () => void
  clear(): void
}

export function createRuntimeEventLog(): RuntimeEventLog {
  const listeners = new Map<string, Set<RuntimeEventHandler>>()

  return {
    dispatch(event) {
      listeners.get(event.type)?.forEach((handler) => handler(event))
      listeners.get('*')?.forEach((handler) => handler(event))
    },
    subscribe(type: RuntimeDomainEventType | '*', handler: RuntimeEventHandler) {
      const key = type as string
      const handlers = listeners.get(key) ?? new Set<RuntimeEventHandler>()
      handlers.add(handler as RuntimeEventHandler)
      listeners.set(key, handlers)

      return () => {
        handlers.delete(handler as RuntimeEventHandler)
        if (handlers.size === 0) listeners.delete(key)
      }
    },
    clear() {
      listeners.clear()
    },
  }
}

import type { DevtoolsRpcChannelKind } from './types'

export interface DevtoolsRpcChannel {
  post(data: unknown, ...extras: unknown[]): unknown
  on(handler: (data: unknown, ...extras: unknown[]) => void): unknown
  off?(handler: (data: unknown, ...extras: unknown[]) => void): unknown
  serialize?(data: unknown): unknown
  deserialize?(data: unknown): unknown
  meta?: unknown
}

export interface DevtoolsRpcChannelHandle {
  readonly kind?: DevtoolsRpcChannelKind
  dispose(): void
}

export function createMessagePortDevtoolsRpcChannel(port: MessagePort): DevtoolsRpcChannel {
  const handlers = new WeakMap<
    (data: unknown, ...extras: unknown[]) => void,
    (event: MessageEvent) => void
  >()

  port.start()

  return {
    post(data) {
      port.postMessage(data)
    },
    on(handler) {
      const listener = (event: MessageEvent) => handler(event.data)
      handlers.set(handler, listener)
      port.addEventListener('message', listener)
    },
    off(handler) {
      const listener = handlers.get(handler)
      if (!listener) return
      port.removeEventListener('message', listener)
      handlers.delete(handler)
    },
  }
}

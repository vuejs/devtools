import type {
  ChromeExtensionEvent,
  ChromeRuntimePort,
} from '../../packages/kit/src/rpc/channels/extension'

class MockChromeEvent<TArgs extends unknown[]> implements ChromeExtensionEvent<
  (...args: TArgs) => void
> {
  private listeners = new Set<(...args: TArgs) => void>()

  addListener(listener: (...args: TArgs) => void): void {
    this.listeners.add(listener)
  }

  removeListener(listener: (...args: TArgs) => void): void {
    this.listeners.delete(listener)
  }

  emit(...args: TArgs): void {
    // Snapshot so listeners removed while dispatching (e.g. forwarding torn
    // down by a frame switch) keep deterministic delivery.
    for (const listener of Array.from(this.listeners)) listener(...args)
  }
}

export interface MockChromePortSenderInit {
  tabId?: number
  frameId?: number
  documentId?: string
  url?: string
}

export class MockChromeRuntimePort implements ChromeRuntimePort {
  readonly onDisconnect = new MockChromeEvent<[port: ChromeRuntimePort]>()
  readonly onMessage = new MockChromeEvent<[message: unknown, port: ChromeRuntimePort]>()
  readonly messages: unknown[] = []
  disconnected = false

  constructor(
    readonly name: string,
    sender?: number | MockChromePortSenderInit,
  ) {
    if (typeof sender === 'number') {
      this.sender = { tab: { id: sender } }
    } else if (sender) {
      this.sender = {
        tab: sender.tabId == null ? undefined : { id: sender.tabId },
        frameId: sender.frameId,
        documentId: sender.documentId,
        url: sender.url,
      }
    }
  }

  sender?: ChromeRuntimePort['sender']

  disconnect(): void {
    if (this.disconnected) return
    this.disconnected = true
    this.onDisconnect.emit(this)
  }

  postMessage(message: unknown): void {
    if (this.disconnected) throw new Error('Port is disconnected')
    this.messages.push(message)
  }

  receive(message: unknown): void {
    this.onMessage.emit(message, this)
  }
}

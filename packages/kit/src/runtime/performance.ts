export interface RuntimePerformanceSnapshot {
  receivedEvents: number
  emittedEvents: number
  droppedEvents: number
  coalescedEvents: number
  bufferedEvents: number
  bufferedBytes: number
  collectionActive: boolean
  attachedClients: number
}

export interface RuntimePerformanceMonitor {
  snapshot(): RuntimePerformanceSnapshot
  recordReceived(count?: number): void
  recordEmitted(count?: number): void
  recordDropped(count?: number): void
  recordCoalesced(count?: number): void
  setBuffer(events: number, bytes: number): void
  setCollectionState(active: boolean, attachedClients: number): void
}

export function createRuntimePerformanceMonitor(
  collectionActive: boolean,
): RuntimePerformanceMonitor {
  const state: RuntimePerformanceSnapshot = {
    attachedClients: 0,
    bufferedBytes: 0,
    bufferedEvents: 0,
    coalescedEvents: 0,
    collectionActive,
    droppedEvents: 0,
    emittedEvents: 0,
    receivedEvents: 0,
  }

  return {
    snapshot() {
      return { ...state }
    },
    recordReceived(count = 1) {
      state.receivedEvents += count
    },
    recordEmitted(count = 1) {
      state.emittedEvents += count
    },
    recordDropped(count = 1) {
      state.droppedEvents += count
    },
    recordCoalesced(count = 1) {
      state.coalescedEvents += count
    },
    setBuffer(events, bytes) {
      state.bufferedEvents = events
      state.bufferedBytes = bytes
    },
    setCollectionState(active, attachedClients) {
      state.collectionActive = active
      state.attachedClients = attachedClients
    },
  }
}

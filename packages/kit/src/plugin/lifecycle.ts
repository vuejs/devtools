type ConnectionCallback = () => void

interface DevtoolsConnectionState {
  clientTokens: Set<symbol>
  clientWaiters: Set<ConnectionCallback>
  runtimeTokens: Set<symbol>
  runtimeWaiters: Set<ConnectionCallback>
}

const DEVTOOLS_CONNECTION_STATE = Symbol.for('vue-devtools:connection-state')

export function onDevToolsConnected(callback: ConnectionCallback): Promise<void> {
  const state = getConnectionState()
  return waitForConnection(state.runtimeTokens.size > 0, state.runtimeWaiters, callback)
}

export function onDevToolsClientConnected(callback: ConnectionCallback): Promise<void> {
  const state = getConnectionState()
  return waitForConnection(isClientConnected(state), state.clientWaiters, callback)
}

export function markDevToolsRuntimeConnected(): () => void {
  const state = getConnectionState()
  const token = Symbol('vue-devtools-runtime')
  state.runtimeTokens.add(token)
  flushWaiters(state.runtimeWaiters)
  if (isClientConnected(state)) flushWaiters(state.clientWaiters)

  return () => {
    state.runtimeTokens.delete(token)
  }
}

export function markDevToolsClientConnected(): () => void {
  const state = getConnectionState()
  const token = Symbol('vue-devtools-client')
  state.clientTokens.add(token)
  if (isClientConnected(state)) flushWaiters(state.clientWaiters)

  return () => {
    state.clientTokens.delete(token)
  }
}

function getConnectionState(): DevtoolsConnectionState {
  const target = globalThis as Record<PropertyKey, unknown>
  const existing = target[DEVTOOLS_CONNECTION_STATE]
  if (isConnectionState(existing)) return existing

  const state: DevtoolsConnectionState = {
    clientTokens: new Set(),
    clientWaiters: new Set(),
    runtimeTokens: new Set(),
    runtimeWaiters: new Set(),
  }
  target[DEVTOOLS_CONNECTION_STATE] = state
  return state
}

function isConnectionState(value: unknown): value is DevtoolsConnectionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<DevtoolsConnectionState>
  return (
    state.clientTokens instanceof Set &&
    state.clientWaiters instanceof Set &&
    state.runtimeTokens instanceof Set &&
    state.runtimeWaiters instanceof Set
  )
}

function isClientConnected(state: DevtoolsConnectionState): boolean {
  return state.runtimeTokens.size > 0 && state.clientTokens.size > 0
}

function waitForConnection(
  connected: boolean,
  waiters: Set<ConnectionCallback>,
  callback: ConnectionCallback,
): Promise<void> {
  if (connected) {
    try {
      callback()
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(error)
    }
  }

  return new Promise<void>((resolve, reject) => {
    waiters.add(() => {
      try {
        callback()
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

function flushWaiters(waiters: Set<ConnectionCallback>): void {
  const pending = [...waiters]
  waiters.clear()
  pending.forEach((waiter) => waiter())
}

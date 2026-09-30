import type { RuntimeCommandRequest, RuntimeCommandResult } from '@vue/devtools-kit'
import type { VueDevtoolsAgentConnection } from './types'

export interface VueDevtoolsAgentSession extends VueDevtoolsAgentConnection {
  command(request: RuntimeCommandRequest): Promise<RuntimeCommandResult>
  dispose(): void
}

export interface VueDevtoolsAgentSessionOptions {
  /**
   * Release the host connection after this many idle milliseconds.
   * `null` keeps it until `dispose()`, which is what the Vite page registration uses
   * so value handles survive the gap between agent turns.
   */
  idleTimeoutMs?: number | null
}

/** Acquire the host connection on the first call; keep in-flight reads and commands together. */
export function createVueDevtoolsAgentSession(
  connect: () => VueDevtoolsAgentConnection & { dispose(): void },
  options: VueDevtoolsAgentSessionOptions = {},
): VueDevtoolsAgentSession {
  const idleTimeoutMs = options.idleTimeoutMs === undefined ? 30_000 : options.idleTimeoutMs
  let connection: (VueDevtoolsAgentConnection & { dispose(): void }) | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let pending = 0
  let disposed = false

  function cancelIdleTimer() {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }

  function release() {
    cancelIdleTimer()
    const current = connection
    connection = undefined
    current?.dispose()
  }

  function scheduleIdle() {
    if (disposed || pending !== 0 || idleTimeoutMs == null || !Number.isFinite(idleTimeoutMs))
      return
    idleTimer = setTimeout(release, idleTimeoutMs)
  }

  async function track<T>(
    run: (current: VueDevtoolsAgentConnection & { dispose(): void }) => Promise<T>,
  ): Promise<T> {
    if (disposed) throw new Error('Vue DevTools agent session is disposed')
    cancelIdleTimer()
    const current = (connection ??= connect())
    pending++
    try {
      return await run(current)
    } finally {
      pending--
      scheduleIdle()
    }
  }

  return {
    query(request) {
      return track((current) => current.query(request))
    },
    command(request) {
      return track((current) => {
        if (!current.command) throw new Error('Vue DevTools agent session cannot send commands')
        return current.command(request)
      })
    },
    dispose() {
      disposed = true
      release()
    },
  }
}

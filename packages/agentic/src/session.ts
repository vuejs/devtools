import type { RuntimeCommandRequest, RuntimeCommandResult } from '@vue/devtools-kit'
import type { VueDevtoolsAgentConnection } from './types'

export interface VueDevtoolsAgentSession extends VueDevtoolsAgentConnection {
  command(request: RuntimeCommandRequest): Promise<RuntimeCommandResult>
  dispose(): void
}

/** Connect on the first call and retain the connection until the host disposes it. */
export function createVueDevtoolsAgentSession(
  connect: () => VueDevtoolsAgentConnection & { dispose(): void },
): VueDevtoolsAgentSession {
  let connection: (VueDevtoolsAgentConnection & { dispose(): void }) | undefined
  let disposed = false

  function getConnection() {
    if (disposed) throw new Error('Vue DevTools agent session is disposed')
    return (connection ??= connect())
  }

  return {
    async query(request) {
      return getConnection().query(request)
    },
    async command(request) {
      const current = getConnection()
      if (!current.command) throw new Error('Vue DevTools agent session cannot send commands')
      return current.command(request)
    },
    dispose() {
      disposed = true
      const current = connection
      connection = undefined
      current?.dispose()
    },
  }
}

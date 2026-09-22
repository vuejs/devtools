import { createRpcClient } from 'devframe/rpc/client'
import type { RuntimeCommand, RuntimeQuery } from '../runtime'
import type { RuntimeRequests } from '../protocol/requests'
import { DEVTOOLS_RPC_COMMAND, DEVTOOLS_RPC_EVENT, DEVTOOLS_RPC_QUERY } from './constants'
import type { DevtoolsRpcChannel } from './channel'
import type {
  DevtoolsRpcClientFunctions,
  DevtoolsRpcEventHandler,
  DevtoolsRpcServerFunctions,
} from './types'

export interface CreateDevtoolsRpcClientOptions {
  channel: DevtoolsRpcChannel
  disposeChannel?: () => void
}

export interface DevtoolsRpcClient extends RuntimeRequests {
  onEvent(handler: DevtoolsRpcEventHandler): () => void
  onConnectionChanged?(handler: (status: 'connecting' | 'connected' | 'closed') => void): () => void
  dispose(): void
}

export function createDevtoolsRpcClient(
  options: CreateDevtoolsRpcClientOptions,
): DevtoolsRpcClient {
  const eventHandlers = new Set<DevtoolsRpcEventHandler>()
  const rpc = createRpcClient<DevtoolsRpcServerFunctions, DevtoolsRpcClientFunctions>(
    {
      [DEVTOOLS_RPC_EVENT](event) {
        eventHandlers.forEach((handler) => handler(event))
      },
    },
    {
      channel: options.channel,
    },
  )

  const query = <T>(request: RuntimeQuery): Promise<T> =>
    rpc.$call(DEVTOOLS_RPC_QUERY, request) as Promise<T>
  const command = (request: RuntimeCommand) => rpc.$call(DEVTOOLS_RPC_COMMAND, request)

  return {
    query: query as RuntimeRequests['query'],
    command,
    queryCustom: query,
    commandCustom: command,
    onEvent(handler) {
      eventHandlers.add(handler)
      return () => {
        eventHandlers.delete(handler)
      }
    },
    dispose() {
      eventHandlers.clear()
      rpc.$close()
      options.disposeChannel?.()
    },
  }
}

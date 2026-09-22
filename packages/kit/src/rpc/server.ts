import {
  createPageScriptChannel,
  type CreatePageScriptChannelOptions,
  type PageScriptChannel,
} from 'devframe/in-page-channel'
import type { DevtoolsInPageProtocol } from './types'
import { createRpcServer } from 'devframe/rpc/server'
import type { DevtoolsRuntime } from '../runtime'
import { markDevToolsClientConnected } from '../plugin/lifecycle'
import { DEVTOOLS_RPC_COMMAND, DEVTOOLS_RPC_EVENT, DEVTOOLS_RPC_QUERY } from './constants'
import type { DevtoolsRpcChannel, DevtoolsRpcChannelHandle } from './channel'
import type { DevtoolsRpcClientFunctions, DevtoolsRpcServerFunctions } from './types'
import { createRuntimeEventBuffer, measureRuntimeMessageBytes } from './event-buffer'

export interface DevtoolsRpcServer {
  attachInPage(
    options: Pick<
      CreatePageScriptChannelOptions<DevtoolsInPageProtocol>,
      'name' | 'window' | 'allowedOrigins'
    >,
  ): { channel: PageScriptChannel<DevtoolsInPageProtocol>; dispose(): void }
  attach(channel: DevtoolsRpcChannel): DevtoolsRpcChannelHandle
  dispose(): void
}

export function createDevtoolsRpcServer(runtime: DevtoolsRuntime): DevtoolsRpcServer {
  const functions: DevtoolsRpcServerFunctions = {
    async [DEVTOOLS_RPC_QUERY](query) {
      const result = await runtime.queryCustom(query)
      const bytes = measureRuntimeMessageBytes(result)
      if (bytes > runtime.budget.transport.maxMessageBytes) {
        runtime.performance.recordDropped()
        throw new Error(
          `Runtime query response exceeds maxMessageBytes (${bytes} > ${runtime.budget.transport.maxMessageBytes})`,
        )
      }
      return result
    },
    [DEVTOOLS_RPC_COMMAND]: (command) => runtime.commandCustom(command),
  }
  const rpc = createRpcServer<DevtoolsRpcClientFunctions, DevtoolsRpcServerFunctions>(functions)
  const pageChannels = new Set<PageScriptChannel<DevtoolsInPageProtocol>>()
  const connections = new Map<object, () => void>()
  let backpressurePaused = false
  const updateCollectionState = () => {
    runtime.setCollectionActive(connections.size > 0 && !backpressurePaused, connections.size)
  }
  const eventBuffer = createRuntimeEventBuffer({
    budget: runtime.budget,
    performance: runtime.performance,
    async emit(event) {
      for (const channel of pageChannels) channel.emit(DEVTOOLS_RPC_EVENT, event)
      await rpc.broadcast.$callRaw({
        method: DEVTOOLS_RPC_EVENT,
        args: [event],
        event: true,
        optional: true,
      })
    },
    setBackpressurePaused(paused) {
      backpressurePaused = paused
      updateCollectionState()
    },
  })
  const eventDisposer = runtime.subscribe('*', (event) => {
    if (connections.size) eventBuffer.enqueue(event)
  })

  return {
    attachInPage(options) {
      const channel = createPageScriptChannel<DevtoolsInPageProtocol>({
        ...options,
        functions: {
          [DEVTOOLS_RPC_QUERY]: { handler: functions[DEVTOOLS_RPC_QUERY], jsonSerializable: false },
          [DEVTOOLS_RPC_COMMAND]: {
            handler: functions[DEVTOOLS_RPC_COMMAND],
            jsonSerializable: false,
          },
        },
      })
      pageChannels.add(channel)
      channel.events.on('panel:connected', (panel) => {
        connections.set(panel, markDevToolsClientConnected())
        updateCollectionState()
      })
      channel.events.on('panel:disconnected', (panel) => {
        connections.get(panel)?.()
        connections.delete(panel)
        if (connections.size === 0) eventBuffer.clear()
        updateCollectionState()
      })
      return {
        channel,
        dispose() {
          channel.close()
          pageChannels.delete(channel)
        },
      }
    },
    attach(channel) {
      if (connections.has(channel)) return { dispose() {} }

      connections.set(channel, markDevToolsClientConnected())
      updateCollectionState()
      const clients = rpc.updateChannels((channels) => {
        channels.push(channel)
      })
      const client = clients.at(-1)

      return {
        dispose() {
          if (!connections.has(channel)) return
          client?.$close()
          connections.get(channel)?.()
          connections.delete(channel)
          rpc.updateChannels((channels) => {
            const index = channels.indexOf(channel)
            if (index >= 0) channels.splice(index, 1)
          })
          if (connections.size === 0) eventBuffer.clear()
          updateCollectionState()
        },
      }
    },
    dispose() {
      for (const channel of pageChannels) channel.close()
      pageChannels.clear()
      eventDisposer()
      eventBuffer.clear()
      rpc.clients.forEach((client) => client.$close())
      connections.forEach((dispose) => dispose())
      connections.clear()
      rpc.updateChannels((channels) => {
        channels.splice(0, channels.length)
      })
      updateCollectionState()
    },
  }
}

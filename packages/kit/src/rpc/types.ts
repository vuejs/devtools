import type {
  AppId,
  ComponentId,
  RuntimeCommand,
  RuntimeCommandResult,
  RuntimeDomainEvent,
  RuntimeQuery,
} from '../runtime'
import type { EncodedValue } from '../codec'
import type { ComponentTreePatch } from '../protocol'
import { DEVTOOLS_RPC_COMMAND, DEVTOOLS_RPC_EVENT, DEVTOOLS_RPC_QUERY } from './constants'

export type DevtoolsRpcChannelKind = 'iframe' | 'extension'

export interface DevtoolsRpcEvent {
  type: RuntimeDomainEvent['type']
  time: number
  appId?: AppId
  componentId?: ComponentId
  reason?: string
  inspectorId?: string
  nodeId?: string
  pluginId?: string
  layerId?: string
  label?: string
  color?: number
  title?: string
  subtitle?: string
  data?: EncodedValue
  meta?: EncodedValue
  groupId?: number
  logType?: 'default' | 'warning' | 'error'
  all?: boolean
  dropped?: number
  coalesced?: number
  version?: number
  patches?: ComponentTreePatch[]
}

export type DevtoolsRpcEventHandler = (event: DevtoolsRpcEvent) => void

export type DevtoolsRpcServerFunctions = {
  [DEVTOOLS_RPC_QUERY]: (query: RuntimeQuery) => Promise<unknown>
  [DEVTOOLS_RPC_COMMAND]: (command: RuntimeCommand) => Promise<RuntimeCommandResult>
}

export type DevtoolsRpcClientFunctions = {
  [DEVTOOLS_RPC_EVENT]: (event: DevtoolsRpcEvent) => void
}

export interface DevtoolsInPageProtocol {
  functions: { pageScript: DevtoolsRpcServerFunctions }
  events: { panel: DevtoolsRpcClientFunctions }
}

export function toDevtoolsRpcEvent(event: RuntimeDomainEvent): DevtoolsRpcEvent | undefined {
  // Vue hook payloads stay inside the runtime. The client consumes their
  // derived tree, state and timeline events instead of raw Vue instances.
  switch (event.type) {
    case 'app:init':
    case 'app:unmount':
    case 'component:add':
    case 'component:update':
    case 'component:remove':
    case 'component:emit':
    case 'perf:start':
    case 'perf:end':
      return
  }

  const payload: DevtoolsRpcEvent = {
    type: event.type,
    time: event.time,
  }

  if ('appId' in event && typeof event.appId === 'string') payload.appId = event.appId
  if ('componentId' in event && typeof event.componentId === 'string')
    payload.componentId = event.componentId
  else if ('instanceId' in event && typeof event.instanceId === 'string')
    payload.componentId = event.instanceId

  if ('reason' in event && typeof event.reason === 'string') payload.reason = event.reason
  if ('inspectorId' in event && typeof event.inspectorId === 'string')
    payload.inspectorId = event.inspectorId
  if ('nodeId' in event && typeof event.nodeId === 'string') payload.nodeId = event.nodeId
  if ('pluginId' in event && typeof event.pluginId === 'string') payload.pluginId = event.pluginId
  if ('layerId' in event && typeof event.layerId === 'string') payload.layerId = event.layerId
  if ('label' in event && typeof event.label === 'string') payload.label = event.label
  if ('color' in event && typeof event.color === 'number') payload.color = event.color
  if ('title' in event && typeof event.title === 'string') payload.title = event.title
  if ('subtitle' in event && typeof event.subtitle === 'string') payload.subtitle = event.subtitle
  if ('data' in event) payload.data = event.data
  if ('meta' in event) payload.meta = event.meta
  if ('groupId' in event && typeof event.groupId === 'number') payload.groupId = event.groupId
  if ('logType' in event && typeof event.logType === 'string') payload.logType = event.logType
  if ('all' in event && typeof event.all === 'boolean') payload.all = event.all
  if ('dropped' in event && typeof event.dropped === 'number') payload.dropped = event.dropped
  if ('coalesced' in event && typeof event.coalesced === 'number')
    payload.coalesced = event.coalesced
  if ('version' in event && typeof event.version === 'number') payload.version = event.version
  if ('patches' in event && Array.isArray(event.patches)) payload.patches = event.patches

  return payload
}

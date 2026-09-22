import type { EncodedValue } from '../codec'
import type { ComponentTreePatch } from '../protocol/patches'

export type AppId = string
export type ComponentId = string
export type InspectorId = string
export type PluginId = string
export type RuntimeEventType = RuntimeEvent['type']
export type RuntimeDomainEventType = RuntimeDomainEvent['type']
export type MaybePromise<T> = T | Promise<T>

export type AppRef = object
export type InstanceRef = object

export interface VueTypeMap {
  [key: string]: string | symbol
}

export interface RuntimeEventBase {
  time: number
}

export type RuntimeEvent =
  | (RuntimeEventBase & {
      type: 'app:init'
      app: AppRef
      version: string
      vueTypes: VueTypeMap
    })
  | (RuntimeEventBase & {
      type: 'app:unmount'
      app: AppRef
    })
  | (RuntimeEventBase & {
      type: 'component:add'
      appId: AppId
      app?: AppRef
      instance: InstanceRef
      parent?: InstanceRef
    })
  | (RuntimeEventBase & {
      type: 'component:update'
      appId: AppId
      app?: AppRef
      instance: InstanceRef
      parent?: InstanceRef
    })
  | (RuntimeEventBase & {
      type: 'component:remove'
      appId: AppId
      app?: AppRef
      instanceId?: ComponentId
      instance?: InstanceRef
      parentId?: ComponentId
      parent?: InstanceRef
    })
  | (RuntimeEventBase & {
      type: 'component:emit'
      appId: AppId
      app?: AppRef
      instance: InstanceRef
      event: string
      args: unknown[]
    })
  | (RuntimeEventBase & {
      type: 'perf:start' | 'perf:end'
      appId: AppId
      app?: AppRef
      instance: InstanceRef
      phase: string
      timestamp: number
    })
  | (RuntimeEventBase & {
      type: 'plugin:setup'
      descriptor: unknown
      setup: unknown
    })

export type RuntimeDomainEvent =
  | RuntimeEvent
  | {
      type: 'apps:changed'
      time: number
      appId?: AppId
    }
  | {
      type: 'components:changed'
      time: number
      appId: AppId
      componentId?: ComponentId
      reason: 'add' | 'update' | 'remove'
    }
  | {
      type: 'components:treePatched'
      time: number
      appId: AppId
      version: number
      patches: ComponentTreePatch[]
    }
  | {
      type: 'components:stateInvalidated'
      time: number
      appId: AppId
      componentId: ComponentId
      version: number
      reason: 'add' | 'update' | 'remove' | 'edit'
    }
  | {
      type: 'inspectors:changed'
      time: number
      appId?: AppId
      inspectorId: InspectorId
      pluginId?: PluginId
      reason: 'add' | 'update' | 'remove'
    }
  | {
      type: 'inspectors:treeInvalidated'
      time: number
      appId?: AppId
      inspectorId: InspectorId
      pluginId?: PluginId
      reason: 'update'
    }
  | {
      type: 'inspectors:stateInvalidated'
      time: number
      appId?: AppId
      inspectorId: InspectorId
      nodeId?: string
      pluginId?: PluginId
      reason: 'select' | 'edit' | 'update' | 'action'
    }
  | {
      type: 'timeline:layerAdded'
      time: number
      appId?: AppId
      pluginId?: PluginId
      layerId: string
      label?: string
      color?: number
    }
  | {
      type: 'timeline:eventAdded'
      time: number
      appId?: AppId
      pluginId?: PluginId
      layerId: string
      title: string
      subtitle?: string
      data?: EncodedValue
      meta?: EncodedValue
      groupId?: number
      logType?: 'default' | 'warning' | 'error'
      all?: boolean
    }
  | {
      type: 'timeline:eventsLimited'
      time: number
      layerId: string
      dropped: number
      coalesced: number
    }

/** Unvalidated wire request; use RuntimeQueryRequest for built-in callers. */
export interface RuntimeQuery {
  type: string
  appId?: AppId
  payload?: unknown
}

export interface RuntimeCommand<Payload = unknown> {
  type: string
  appId?: AppId
  payload?: Payload
}

export interface RuntimeCommandResult {
  status: 0 | 1
  error?: unknown
}

export type RuntimeEventHandler<TEvent extends RuntimeDomainEvent = RuntimeDomainEvent> = (
  event: TEvent,
) => void

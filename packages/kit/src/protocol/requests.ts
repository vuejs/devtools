import type {
  CustomInspectorOptions,
  TimelineEventOptions,
  TimelineLayerOptions,
} from '../plugin/api'
import type { ComponentBounds } from '../runtime/component-inspector'
import type { RuntimeInspectorInfo } from '../runtime/inspectors'
import type { RuntimePerformanceSnapshot } from '../runtime/performance'
import type { AppId, RuntimeCommand, RuntimeCommandResult, RuntimeQuery } from '../runtime/types'
import type {
  AppsSnapshotMessage,
  ComponentInspectionResultMessage,
  ComponentStateSnapshotMessage,
  ComponentTreeSnapshotMessage,
  ComponentTreePageMessage,
  DevtoolsCapabilitiesMessage,
  ExpandedValueMessage,
  InspectorsListMessage,
  InspectorTreeSnapshotMessage,
  PluginsSnapshotMessage,
  RouterRouteRecordSnapshot,
  RouterSnapshotMessage,
} from './messages'

type ComponentTarget = { componentId: string } | { instance: object }
type InspectorTarget = { inspectorId: string; app?: object; pluginId?: string }
interface StateEdit {
  sectionId?: string
  path: string[]
  value?: unknown
  remove?: boolean
  newKey?: string
}

/** Built-in request contracts. Extend these interfaces to type additional registered methods. */
export interface RuntimeQueryMap {
  'apps:snapshot': { payload: undefined; result: AppsSnapshotMessage }
  'devtools:capabilities': { payload: undefined; result: DevtoolsCapabilitiesMessage }
  'runtime:health': {
    payload: undefined
    result: { status: 'ready'; performance: RuntimePerformanceSnapshot }
  }
  'plugins:snapshot': { payload: undefined; result: PluginsSnapshotMessage }
  'components:treeSnapshot': {
    payload: { filter?: string } | undefined
    result: ComponentTreeSnapshotMessage
  }
  'components:treeChildren': {
    payload: { componentId: string; cursor?: string }
    result: ComponentTreePageMessage
  }
  'components:stateSnapshot': {
    payload: { componentId: string; maxEntries?: number }
    result: ComponentStateSnapshotMessage | undefined
  }
  'components:inspect': { payload: undefined; result: ComponentInspectionResultMessage | undefined }
  'components:getBounds': { payload: ComponentTarget; result: ComponentBounds | undefined }
  'components:getName': { payload: ComponentTarget; result: string | undefined }
  'components:getRenderCode': { payload: ComponentTarget; result: string | undefined }
  'inspectors:list': { payload: undefined; result: InspectorsListMessage }
  'inspectors:info': { payload: { inspectorId: string }; result: RuntimeInspectorInfo | undefined }
  'inspectors:treeSnapshot': {
    payload: { inspectorId: string; filter?: string }
    result: InspectorTreeSnapshotMessage
  }
  'inspectors:stateSnapshot': {
    payload: { inspectorId: string; nodeId: string }
    result: ComponentStateSnapshotMessage | undefined
  }
  'router:snapshot': { payload: undefined; result: RouterSnapshotMessage }
  'router:matchedRoutes': {
    payload: { path: string }
    result: { appId?: string; path: string; routes: RouterRouteRecordSnapshot[] }
  }
  'values:expand': {
    payload: { handle: string; path?: string[]; maxEntries?: number }
    result: ExpandedValueMessage | undefined
  }
  'values:storeAsGlobal': {
    payload: { handle: string } | { componentId: string; sectionId: string; path: string[] }
    result: { varName: string } | undefined
  }
}

export interface RuntimeCommandMap {
  'components:expandTreeNode': { componentId: string }
  'components:cancelTreeChildren': { cursor: string }
  'components:cancelInspect': undefined
  'components:highlight': ComponentTarget
  'components:unhighlight': undefined
  'components:setHighlightUpdates': { enabled: boolean }
  'components:scrollTo': ComponentTarget
  'components:inspectDom': ComponentTarget
  'components:editState': StateEdit & { componentId: string; stateType?: string }
  'components:addState': {
    componentId: string
    sectionId?: string
    path: string[]
    value?: unknown
  }
  'components:invalidate': { componentId: string }
  'values:customAction': { handle: string; actionIndex: number }
  'values:recompute': { componentId: string; sectionId: string; path: string[] }
  'inspectors:add': { options: CustomInspectorOptions; pluginId: string; app?: object }
  'inspectors:invalidateTree': InspectorTarget
  'inspectors:invalidateState': InspectorTarget
  'inspectors:selectNode': InspectorTarget & { nodeId: string }
  'inspectors:editState': StateEdit & { inspectorId: string; nodeId: string }
  'inspectors:callAction': { inspectorId: string; actionIndex: number }
  'inspectors:callNodeAction': { inspectorId: string; nodeId: string; actionIndex: number }
  'plugins:updateSetting': { pluginId: string; key: string; value: unknown }
  'router:navigate': { path: string }
  'timeline:setRecording': { recording?: boolean; disabledLayerIds?: string[] }
  'timeline:clear': undefined
  'timeline:inspectEvent': { pluginId: string; layerId?: string; event: object }
  'timeline:addLayer': { options: TimelineLayerOptions; pluginId?: string; app?: object }
  'timeline:addEvent': { options: TimelineEventOptions; pluginId?: string; app?: object }
}

type RequestPayload<P> = undefined extends P ? { payload?: P } : { payload: P }

export type RuntimeQueryRequest<K extends keyof RuntimeQueryMap = keyof RuntimeQueryMap> = {
  [T in K]: { type: T; appId?: AppId } & RequestPayload<RuntimeQueryMap[T]['payload']>
}[K]

export type RuntimeCommandRequest<K extends keyof RuntimeCommandMap = keyof RuntimeCommandMap> = {
  [T in K]: { type: T; appId?: AppId } & RequestPayload<RuntimeCommandMap[T]>
}[K]

export interface RuntimeRequests {
  query<K extends keyof RuntimeQueryMap>(
    request: RuntimeQueryRequest<K>,
  ): Promise<RuntimeQueryMap[K]['result']>
  command(request: RuntimeCommandRequest): Promise<RuntimeCommandResult>
  /** Explicit escape hatches for dynamic extensions and unvalidated transport messages. */
  queryCustom<T = unknown>(request: RuntimeQuery): Promise<T>
  commandCustom(request: RuntimeCommand): Promise<RuntimeCommandResult>
}

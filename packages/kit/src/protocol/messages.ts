import type { EncodedValue } from '../codec'
import type { AppId, ComponentId, InspectorId } from '../runtime'
import type { PluginSettingsItem } from '../plugin/api'

export interface AppSnapshot {
  id: AppId
  name: string
  version?: string
  componentCount: number
}

export interface ComponentTreeNodeTag {
  label: string
  textColor?: number
  backgroundColor?: number
  tooltip?: string
}

export interface AppsSnapshotMessage {
  apps: AppSnapshot[]
}

export interface DevtoolsCapabilitiesMessage {
  openInEditor: boolean
  pagedComponentTree?: boolean
}

export interface ComponentTreePageMessage {
  nodes: ComponentTreeNodeSnapshot[]
  cursor?: string
}

export interface ComponentTreeNodeSnapshot {
  id: ComponentId
  appId: AppId
  parentId?: ComponentId
  name: string
  file?: string
  renderKey?: string | number
  inactive?: boolean
  isFragment?: boolean
  tags?: ComponentTreeNodeTag[]
  domOrder?: number[]
  consoleId?: number
  autoOpen?: boolean
  lastMountMs?: number
  lastUpdateMs?: number
  updatedAt: number
  childCount?: number
}

export interface ComponentTreeSnapshotMessage {
  appId?: AppId
  version?: number
  nodes: ComponentTreeNodeSnapshot[]
}

export interface ComponentStateSnapshotMessage {
  componentId: ComponentId
  version: number
  sections: ComponentStateSection[]
  reactivityGraph?: ReactivityGraphSnapshot
}

export interface ComponentInspectionResultMessage {
  appId: AppId
  componentId: ComponentId
  nodes?: ComponentTreeNodeSnapshot[]
}

export interface ComponentStateSection {
  id: string
  label: string
  entries: StateEntry[]
  partial?: boolean
}

export interface StateEntry {
  key: string
  path: string[]
  value: EncodedValue
  editable: boolean
  meta?: Record<string, unknown>
}

export type ReactivityGraphNodeType =
  | 'ref'
  | 'computed'
  | 'reactive'
  | 'watch'
  | 'render'
  | 'effect'
  | 'unknown'

export interface ReactivityGraphNode {
  id: string
  type: ReactivityGraphNodeType
  label: string
  data: Record<string, unknown>
}

export interface ReactivityRelationship {
  id: string
  from: string
  to: string
}

export interface ReactivityGraphSnapshot {
  nodes: ReactivityGraphNode[]
  relationships: ReactivityRelationship[]
}

export interface ExpandedValueMessage {
  handle: string
  path: string[]
  value: EncodedValue
}

export interface InspectorsListMessage {
  inspectors: {
    id: InspectorId
    label: string
    pluginId?: string
    icon?: string
    treeFilterPlaceholder?: string
    stateFilterPlaceholder?: string
    noSelectionText?: string
    actions?: { icon: string; tooltip?: string }[]
    nodeActions?: { icon: string; tooltip?: string }[]
  }[]
}

export interface InspectorTreeSnapshotMessage {
  inspectorId: InspectorId
  rootNodes: CustomInspectorTreeNode[]
}

export interface CustomInspectorTreeNode {
  id: string
  label: string
  children?: CustomInspectorTreeNode[]
  tags?: ComponentTreeNodeTag[]
  name?: string
  file?: string
}

export interface PluginSnapshot {
  id: string
  label?: string
  logo?: string
  packageName?: string
  homepage?: string
  settings: Record<string, PluginSettingsItem>
  settingValues: Record<string, unknown>
}

export interface PluginsSnapshotMessage {
  plugins: PluginSnapshot[]
}

export interface RouterRouteRecordSnapshot {
  path: string
  name?: string
  children?: RouterRouteRecordSnapshot[]
  meta?: Record<string, unknown>
}

export interface RouterRouteSnapshot {
  fullPath?: string
  hash?: string
  href?: string
  path?: string
  name?: string
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  matched?: RouterRouteRecordSnapshot[]
}

export interface RouterSnapshotMessage {
  appId?: AppId
  currentRoute?: RouterRouteSnapshot
  routes: RouterRouteRecordSnapshot[]
}

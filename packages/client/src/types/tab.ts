export type BuiltinDevtoolsTabId =
  | 'overview'
  | 'components'
  | 'pages'
  | 'timeline'
  | 'plugins'
  | 'graph'
  | 'settings'

export type KnownInspectorDevtoolsTabId = 'router' | 'pinia'

export type DevtoolsTabId =
  | BuiltinDevtoolsTabId
  | KnownInspectorDevtoolsTabId
  | `inspector:${string}`

export interface DevtoolsTabDefinition {
  id: DevtoolsTabId
  title: string
  icon: string
  order: number
  description: string
  path?: string
}

export type DevtoolsTab = DevtoolsTabDefinition

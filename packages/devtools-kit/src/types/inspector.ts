import type { ComponentState, StateBase } from './component'

export interface CustomInspectorOptions {
  id: string
  label: string
  icon?: string
  treeFilterPlaceholder?: string
  stateFilterPlaceholder?: string
  noSelectionText?: string
  actions?: {
    icon: string
    tooltip?: string
    action: () => void | Promise<void>
  }[]
  nodeActions?: {
    icon: string
    tooltip?: string
    action: (nodeId: string) => void | Promise<void>
  }[]
}

export interface InspectorNodeTag {
  label: string
  textColor: number
  backgroundColor: number
  tooltip?: string
}

export type EditStatePayload = {
  value: any
  newKey?: string | null
  remove?: undefined | false
} | {
  value?: undefined
  newKey?: undefined
  remove: true
}

export interface CustomInspectorNode {
  id: string
  label: string
  children?: CustomInspectorNode[]
  tags?: InspectorNodeTag[]
  name?: string
  file?: string
}

export interface CustomInspectorState {
  [key: string]: (StateBase | Omit<ComponentState, 'type'>)[]
}

export interface ReactivityRelationship {
  id: string
  from: string
  to: string
}

export interface ReactivityGraphNode {
  id: string
  type: string
  data: Record<string, unknown>
}

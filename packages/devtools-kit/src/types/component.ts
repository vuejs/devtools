import type { InspectorNodeTag } from './inspector'

export type ComponentInstance = any // @TODO

export interface ComponentTreeNode {
  uid: string | number
  id: string
  name: string
  renderKey: string | number
  inactive: boolean
  isFragment: boolean
  hasChildren: boolean
  children: ComponentTreeNode[]
  domOrder?: number[]
  consoleId?: string
  isRouterView?: boolean
  macthedRouteSegment?: string
  tags: InspectorNodeTag[]
  autoOpen: boolean
  meta?: any
  file?: string
}

type ComponentBuiltinCustomStateTypes = 'function' | 'map' | 'set' | 'reference' | 'component' | 'component-definition' | 'store'

interface ComponentCustomState extends ComponentStateBase {
  value: CustomState
}

export interface StateBase {
  key: string
  value: any
  editable?: boolean
  objectType?: 'ref' | 'reactive' | 'computed' | 'other'
  raw?: string
}

interface ComponentStateBase extends StateBase {
  type: string
}

interface ComponentPropState extends ComponentStateBase {
  meta?: {
    type: string
    required: boolean
    /** Vue 1 only */
    mode?: 'default' | 'sync' | 'once'
  }
}

interface CustomState {
  _custom: {
    type: ComponentBuiltinCustomStateTypes | string
    objectType?: string
    display?: string
    tooltip?: string
    value?: any
    abstract?: boolean
    file?: string
    uid?: number
    readOnly?: boolean
    /** Configure immediate child fields */
    fields?: {
      abstract?: boolean
    }
    id?: any
    actions?: {
      icon: string
      tooltip?: string
      action: () => void | Promise<void>
    }[]
    /** internal */
    _reviveId?: number
  }
}

export type ComponentState = ComponentStateBase | ComponentPropState | ComponentCustomState

export interface InspectedComponentData {
  id: string
  name: string
  file: string
  state: ComponentState[]
  functional?: boolean
}

export interface ComponentBounds {
  left: number
  top: number
  width: number
  height: number
}

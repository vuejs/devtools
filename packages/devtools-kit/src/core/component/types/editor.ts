import type { AppRecord } from '../../../types'
import type { Recordable } from '../state/editor'

export type PropPath = string | string[]

export interface InspectorStateEditorPayload {
  app?: AppRecord['app']
  inspectorId: string
  nodeId: string
  type: string // reactive, ref, computed......
  path: PropPath
  state: {
    value: unknown
    newKey: string
    remove?: boolean
    type: string // typeof something...
  }
  set?: (
    obj: Recordable,
    path: PropPath,
    value: unknown,
    cb?: (object: Recordable, field: string, value: unknown) => void,
  ) => unknown
}

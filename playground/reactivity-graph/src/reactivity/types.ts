export type ReactivityNodeType =
  | 'ref'
  | 'computed'
  | 'reactive'
  | 'watch'
  | 'effect'
  | 'render'
  | 'unknown'

export interface ReactivityGraphNode {
  id: string
  label: string
  type: ReactivityNodeType
  subtitle?: string
  value?: string
  runCount?: number
}

export interface ReactivityGraphLink {
  id: string
  from: string
  to: string
}

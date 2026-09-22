import type { ComponentId } from '../runtime'
import type { ComponentTreeNodeSnapshot } from './messages'

export type ComponentTreePatch =
  | { op: 'insert'; parentId?: ComponentId; index?: number; node: ComponentTreeNodeSnapshot }
  | { op: 'remove'; id: ComponentId }
  | { op: 'update'; id: ComponentId; changes: Partial<ComponentTreeNodeSnapshot> }
  | { op: 'reorder'; parentId: ComponentId; children: ComponentId[] }

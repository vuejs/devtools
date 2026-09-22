import type { CustomInspectorOptions } from '../plugin'
import type { AppRef, InspectorId, PluginId } from './types'

export interface RuntimeInspectorAction {
  icon: string
  tooltip?: string
}

export interface RuntimeInspectorRecord {
  pluginId: PluginId
  app?: AppRef
  options: CustomInspectorOptions
  treeFilter: string
  selectedNodeId: string
}

export interface RuntimeInspectorInfo {
  id: InspectorId
  label: string
  icon?: string
  pluginId: PluginId
  treeFilterPlaceholder: string
  stateFilterPlaceholder: string
  noSelectionText?: string
  actions: RuntimeInspectorAction[]
  nodeActions: RuntimeInspectorAction[]
}

export class RuntimeInspectorStore {
  private records: RuntimeInspectorRecord[] = []

  add(options: CustomInspectorOptions, pluginId: PluginId, app?: AppRef): RuntimeInspectorRecord {
    const existing = this.records.find(
      (record) =>
        record.options.id === options.id && record.pluginId === pluginId && record.app === app,
    )

    if (existing) {
      existing.options = options
      return existing
    }

    const record: RuntimeInspectorRecord = {
      pluginId,
      app,
      options,
      treeFilter: '',
      selectedNodeId: '',
    }
    this.records.push(record)
    return record
  }

  list(app?: AppRef): RuntimeInspectorInfo[] {
    return this.records
      .filter((record) => !app || record.app === app || record.app == null)
      .map((record) => this.toInfo(record))
  }

  get(id: InspectorId, app?: AppRef): RuntimeInspectorRecord | undefined {
    // With an app scope, only that app's record or an app-less (global) record
    // may match; another app's same-id inspector must stay invisible.
    if (app) {
      return (
        this.records.find((record) => record.options.id === id && record.app === app) ??
        this.records.find((record) => record.options.id === id && record.app == null)
      )
    }

    return this.records.find((record) => record.options.id === id)
  }

  removeByApp(app: AppRef): RuntimeInspectorRecord[] {
    const removed = this.records.filter((record) => record.app === app)
    if (removed.length) this.records = this.records.filter((record) => record.app !== app)
    return removed
  }

  getInfo(id: InspectorId, app?: AppRef): RuntimeInspectorInfo | undefined {
    const record = this.get(id, app)
    return record ? this.toInfo(record) : undefined
  }

  setSelectedNode(id: InspectorId, nodeId: string, app?: AppRef): void {
    const record = this.get(id, app)
    if (record) record.selectedNodeId = nodeId
  }

  async callAction(id: InspectorId, actionIndex: number, app?: AppRef): Promise<boolean> {
    const action = this.get(id, app)?.options.actions?.[actionIndex]?.action
    if (typeof action !== 'function') return false
    await action()
    return true
  }

  async callNodeAction(
    id: InspectorId,
    actionIndex: number,
    nodeId: string,
    app?: AppRef,
  ): Promise<boolean> {
    const action = this.get(id, app)?.options.nodeActions?.[actionIndex]?.action
    if (typeof action !== 'function') return false
    await action(nodeId)
    return true
  }

  clear(): void {
    this.records = []
  }

  private toInfo(record: RuntimeInspectorRecord): RuntimeInspectorInfo {
    const options = record.options
    return {
      id: options.id,
      label: options.label,
      icon: options.icon,
      pluginId: record.pluginId,
      treeFilterPlaceholder: options.treeFilterPlaceholder ?? 'Search tree...',
      stateFilterPlaceholder: options.stateFilterPlaceholder ?? 'Search state...',
      noSelectionText: options.noSelectionText,
      actions: toActionMetadata(options.actions),
      nodeActions: toActionMetadata(options.nodeActions),
    }
  }
}

function toActionMetadata(
  actions: CustomInspectorOptions['actions'] | CustomInspectorOptions['nodeActions'],
): RuntimeInspectorAction[] {
  if (!Array.isArray(actions)) return []

  return actions.map((action) => ({
    icon: action.icon,
    tooltip: action.tooltip,
  }))
}

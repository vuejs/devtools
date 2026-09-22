import type { CustomInspectorOptions } from '../../plugin'
import type { ComponentStateSnapshotMessage, InspectorsListMessage } from '../../protocol'
import type { DevtoolsRuntime } from '../runtime'
import type { LegacyComponentStateEntry } from '../state'
import { createLegacyStateSetter } from '../state/legacy-edit'
import type { AppRef } from '../types'
import {
  isRecord,
  readBoolean,
  readNumber,
  readObject,
  readRecord,
  readString,
  readStringArray,
  readUnknownProperty,
  resolveAppRef,
  retiredAppError,
} from './shared'

export function registerInspectorHandlers(runtime: DevtoolsRuntime) {
  runtime.registerQuery<InspectorsListMessage>('inspectors:list', (query) => ({
    inspectors: runtime.inspectors.list(resolveAppRef(runtime, query.appId)),
  }))

  runtime.registerQuery('inspectors:info', (query) => {
    const inspectorId = readString(query.payload, 'inspectorId')
    if (!inspectorId) return
    return runtime.inspectors.getInfo(inspectorId, resolveAppRef(runtime, query.appId))
  })

  runtime.registerQuery('inspectors:treeSnapshot', async (query) => {
    const inspectorId = readString(query.payload, 'inspectorId')
    if (!inspectorId) return { inspectorId: '', rootNodes: [] }

    const app = resolveAppRef(runtime, query.appId)
    const inspector = runtime.inspectors.get(inspectorId, app)
    if (!inspector) return { inspectorId, rootNodes: [] }

    const filter = readString(query.payload, 'filter') ?? ''
    inspector.treeFilter = filter

    const payload = {
      app,
      inspectorId,
      filter,
      rootNodes: [],
    }
    await runtime.callPluginHook('getInspectorTree', payload)

    return {
      inspectorId,
      rootNodes: Array.isArray(payload.rootNodes) ? payload.rootNodes : [],
    }
  })

  runtime.registerQuery('inspectors:stateSnapshot', async (query) => {
    const inspectorId = readString(query.payload, 'inspectorId')
    const nodeId = readString(query.payload, 'nodeId')
    if (!inspectorId || !nodeId) return

    const app = resolveAppRef(runtime, query.appId)
    const inspector = runtime.inspectors.get(inspectorId, app)
    if (!inspector) return

    inspector.selectedNodeId = nodeId

    const payload = {
      app,
      inspectorId,
      nodeId,
      state: {},
    }
    await runtime.callPluginHook('getInspectorState', payload)

    return createInspectorStateSnapshot(runtime, inspectorId, nodeId, payload.state)
  })

  runtime.registerCommand('inspectors:add', (command) => {
    const payload = command.payload
    const options = readObject(payload, 'options')
    const pluginId = readString(payload, 'pluginId')
    if (!pluginId || !isCustomInspectorOptions(options))
      return { status: 0, error: 'Invalid inspector payload' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(options.id) }
    runtime.inspectors.add(options, pluginId, app)
    runtime.events.dispatch({
      type: 'inspectors:changed',
      time: Date.now(),
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      inspectorId: options.id,
      pluginId,
      reason: 'add',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:invalidateTree', (command) => {
    const payload = command.payload
    const inspectorId = readString(payload, 'inspectorId')
    if (!inspectorId) return { status: 0, error: 'Invalid inspector id' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(inspectorId) }
    runtime.events.dispatch({
      type: 'inspectors:treeInvalidated',
      time: Date.now(),
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      inspectorId,
      pluginId: readString(payload, 'pluginId'),
      reason: 'update',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:invalidateState', (command) => {
    const payload = command.payload
    const inspectorId = readString(payload, 'inspectorId')
    if (!inspectorId) return { status: 0, error: 'Invalid inspector id' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(inspectorId) }
    const inspector = runtime.inspectors.get(inspectorId, app)
    runtime.events.dispatch({
      type: 'inspectors:stateInvalidated',
      time: Date.now(),
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      inspectorId,
      nodeId: inspector?.selectedNodeId,
      pluginId: readString(payload, 'pluginId'),
      reason: 'update',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:selectNode', (command) => {
    const payload = command.payload
    const inspectorId = readString(payload, 'inspectorId')
    const nodeId = readString(payload, 'nodeId')
    if (!inspectorId || !nodeId) return { status: 0, error: 'Invalid inspector selection' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(inspectorId) }
    runtime.inspectors.setSelectedNode(inspectorId, nodeId, app)
    runtime.events.dispatch({
      type: 'inspectors:stateInvalidated',
      time: Date.now(),
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      inspectorId,
      nodeId,
      pluginId: readString(payload, 'pluginId'),
      reason: 'select',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:editState', async (command) => {
    const payload = command.payload
    const inspectorId = readString(payload, 'inspectorId')
    const nodeId = readString(payload, 'nodeId')
    const rawSectionId = readString(payload, 'sectionId')
    const rawPath = readStringArray(payload, 'path')
    const sectionId = rawSectionId ?? rawPath[0]
    const path = rawSectionId ? rawPath : rawPath.slice(1)

    if (!inspectorId || !nodeId || !sectionId || path.length < 1)
      return { status: 0, error: 'Invalid inspector state edit payload' }

    const app = resolveAppRef(runtime, command.appId)
    const inspector = runtime.inspectors.get(inspectorId, app)
    if (!inspector) return { status: 0, error: `Unknown inspector: ${inspectorId}` }

    const state = {
      value: readUnknownProperty(payload, 'value'),
      newKey: readString(payload, 'newKey') ?? null,
      remove: readBoolean(payload, 'remove') === true,
    }

    await runtime.callPluginHook('editInspectorState', {
      app,
      inspectorId,
      nodeId,
      path,
      type: sectionId,
      state,
      set: createLegacyStateSetter(state),
    })

    runtime.events.dispatch({
      type: 'inspectors:stateInvalidated',
      time: Date.now(),
      appId: inspector.app ? runtime.registry.getAppByRef(inspector.app)?.id : undefined,
      inspectorId,
      nodeId,
      pluginId: inspector.pluginId,
      reason: 'edit',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:callAction', async (command) => {
    const inspectorId = readString(command.payload, 'inspectorId')
    const actionIndex = readNumber(command.payload, 'actionIndex')
    if (!inspectorId || actionIndex == null) return { status: 0, error: 'Invalid inspector action' }

    const app = resolveAppRef(runtime, command.appId)
    const called = await runtime.inspectors.callAction(inspectorId, actionIndex, app)
    if (!called) return { status: 0, error: 'Inspector action is not available' }

    const inspector = runtime.inspectors.get(inspectorId, app)
    runtime.events.dispatch({
      type: 'inspectors:stateInvalidated',
      time: Date.now(),
      appId: inspector?.app ? runtime.registry.getAppByRef(inspector.app)?.id : undefined,
      inspectorId,
      nodeId: inspector?.selectedNodeId,
      pluginId: inspector?.pluginId,
      reason: 'action',
    })
    return { status: 1 }
  })

  runtime.registerCommand('inspectors:callNodeAction', async (command) => {
    const inspectorId = readString(command.payload, 'inspectorId')
    const actionIndex = readNumber(command.payload, 'actionIndex')
    const nodeId = readString(command.payload, 'nodeId')
    if (!inspectorId || actionIndex == null || !nodeId)
      return { status: 0, error: 'Invalid inspector node action' }

    const app = resolveAppRef(runtime, command.appId)
    const called = await runtime.inspectors.callNodeAction(inspectorId, actionIndex, nodeId, app)
    if (!called) return { status: 0, error: 'Inspector node action is not available' }

    const inspector = runtime.inspectors.get(inspectorId, app)
    runtime.events.dispatch({
      type: 'inspectors:stateInvalidated',
      time: Date.now(),
      appId: inspector?.app ? runtime.registry.getAppByRef(inspector.app)?.id : undefined,
      inspectorId,
      nodeId,
      pluginId: inspector?.pluginId,
      reason: 'action',
    })
    return { status: 1 }
  })
}

function createInspectorStateSnapshot(
  runtime: DevtoolsRuntime,
  inspectorId: string,
  nodeId: string,
  state: unknown,
): ComponentStateSnapshotMessage {
  const snapshot: ComponentStateSnapshotMessage = {
    componentId: `inspector:${inspectorId}:${nodeId}`,
    version: Date.now(),
    sections: [],
  }

  runtime.componentState.beginStateScope(`state:${snapshot.componentId}`)
  runtime.componentState.appendLegacyEntries(
    snapshot,
    toInspectorLegacyStateEntries(inspectorId, nodeId, state),
  )

  return snapshot
}

function toInspectorLegacyStateEntries(
  inspectorId: string,
  nodeId: string,
  state: unknown,
): LegacyComponentStateEntry[] {
  if (!isRecord(state)) return []

  const entries: LegacyComponentStateEntry[] = []
  for (const [sectionId, sectionEntries] of Object.entries(state)) {
    if (!Array.isArray(sectionEntries)) continue

    for (const rawEntry of sectionEntries) {
      if (!isRecord(rawEntry)) continue
      const key = readUnknownProperty(rawEntry, 'key')
      if (key == null) continue

      entries.push({
        type: sectionId,
        key: stringifyInspectorStateKey(key),
        value: readUnknownProperty(rawEntry, 'value'),
        editable: readBoolean(rawEntry, 'editable') === true,
        objectType:
          readString(rawEntry, 'objectType') ??
          readString(rawEntry, 'stateTypeName') ??
          readString(rawEntry, 'customType'),
        raw: readString(rawEntry, 'raw'),
        meta: {
          ...readRecord(rawEntry, 'meta'),
          inspectorId,
          nodeId,
          disableAdd: true,
        },
      })
    }
  }

  return entries
}

function isCustomInspectorOptions(value: unknown): value is CustomInspectorOptions {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string'
}

function stringifyInspectorStateKey(key: unknown): string {
  if (typeof key === 'string') return key
  if (typeof key === 'number' || typeof key === 'boolean' || typeof key === 'bigint')
    return String(key)
  if (typeof key === 'symbol') return key.description ?? key.toString()

  try {
    return JSON.stringify(key)
  } catch {
    return Object.prototype.toString.call(key)
  }
}

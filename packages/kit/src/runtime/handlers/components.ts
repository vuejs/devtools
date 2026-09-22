import type { ValueHandleRegistry } from '../../codec'
import type { ComponentStateSnapshotMessage, ComponentTreeSnapshotMessage } from '../../protocol'
import {
  cancelComponentInspection,
  exposeComponentDomTarget,
  exposeComponentInstance,
  exposeValueAsGlobal,
  getComponentRecordBounds,
  getComponentRenderCode,
  highlightComponentRecord,
  inspectComponentInPage,
  scrollToComponentRecord,
  unhighlightComponent,
} from '../component-inspector'
import type { ComponentRecord, ComponentSnapshot } from '../registry'
import type { DevtoolsRuntime } from '../runtime'
import type { LegacyComponentStateEntry } from '../state'
import { createLegacyStateSetter } from '../state/legacy-edit'
import type { createComponentUpdateHighlight } from '../update-highlight'
import { readBoolean, readString, readStringArray } from './shared'

export function registerComponentHandlers(
  runtime: DevtoolsRuntime,
  timelineValueHandles: ValueHandleRegistry,
  highlight: ReturnType<typeof createComponentUpdateHighlight>,
) {
  runtime.registerQuery('components:treeChildren', (query) => {
    const componentId = readString(query.payload, 'componentId')
    if (!query.appId || !componentId) throw new Error('Invalid component expansion')
    return runtime.components.readChildrenPage(
      query.appId,
      componentId,
      readString(query.payload, 'cursor'),
      runtime.budget.transport.maxMessageBytes,
    )
  })

  runtime.registerCommand('components:cancelTreeChildren', (command) => {
    const cursor = readString(command.payload, 'cursor')
    if (command.appId && cursor) runtime.components.cancelChildrenPage(command.appId, cursor)
    return { status: 1 }
  })

  runtime.registerQuery<ComponentTreeSnapshotMessage>('components:treeSnapshot', async (query) => {
    const snapshot = runtime.components.snapshot(query.appId)
    const filter = readString(query.payload, 'filter') ?? ''
    await applyVisitComponentTreeHooks(runtime, snapshot.nodes, filter)
    return snapshot
  })

  runtime.registerCommand('components:expandTreeNode', (command) => {
    const appId = command.appId
    const componentId = readString(command.payload, 'componentId')
    if (!appId || !componentId) return { status: 0, error: 'Invalid component expansion' }

    const batch = runtime.components.expand(appId, componentId)
    if (batch) {
      runtime.events.dispatch({
        type: 'components:treePatched',
        time: Date.now(),
        appId,
        version: batch.version,
        patches: batch.patches,
      })
    }
    return { status: 1 }
  })

  runtime.registerQuery('components:stateSnapshot', async (query) => {
    const componentId =
      query.payload != null &&
      typeof query.payload === 'object' &&
      typeof (query.payload as { componentId?: unknown }).componentId === 'string'
        ? (query.payload as { componentId: string }).componentId
        : undefined
    const maxEntries =
      query.payload != null &&
      typeof query.payload === 'object' &&
      typeof (query.payload as { maxEntries?: unknown }).maxEntries === 'number'
        ? (query.payload as { maxEntries: number }).maxEntries
        : undefined
    if (!componentId) return
    const record = runtime.registry.getComponent(componentId, query.appId)
    if (record) exposeComponentInstance(record)
    const snapshot = runtime.componentState.snapshot(componentId, maxEntries)
    if (record && snapshot) await applyInspectComponentHooks(runtime, record, snapshot)
    return snapshot
  })

  runtime.registerQuery('components:inspect', async () => {
    const result = await inspectComponentInPage(runtime)
    if (!result) return
    return { ...result, nodes: runtime.components.revealPath(result.appId, result.componentId) }
  })

  runtime.registerQuery('components:getBounds', (query) => {
    const record = resolveComponentRecord(runtime, query.appId, query.payload)
    return record ? getComponentRecordBounds(record) : undefined
  })

  runtime.registerQuery('components:getName', (query) => {
    return resolveComponentRecord(runtime, query.appId, query.payload)?.name
  })

  runtime.registerQuery('components:getRenderCode', (query) => {
    const record = resolveComponentRecord(runtime, query.appId, query.payload)
    return record ? getComponentRenderCode(record) : undefined
  })

  runtime.registerQuery('values:expand', (query) => {
    if (query.payload == null || typeof query.payload !== 'object') return
    const payload = query.payload as { handle?: unknown; path?: unknown; maxEntries?: unknown }
    if (typeof payload.handle !== 'string') return
    return runtime.componentState.expand(
      payload.handle,
      Array.isArray(payload.path)
        ? payload.path.filter((segment): segment is string => typeof segment === 'string')
        : [],
      typeof payload.maxEntries === 'number' ? payload.maxEntries : undefined,
    )
  })

  runtime.registerQuery('values:storeAsGlobal', (query) => {
    const payload = query.payload
    const handle = readString(payload, 'handle')
    if (handle) {
      const value = runtime.componentState.getHandleValue(handle)
      if (value === undefined) return
      const varName = exposeValueAsGlobal(value)
      return varName ? { varName } : undefined
    }

    const componentId = readString(payload, 'componentId')
    const sectionId = readString(payload, 'sectionId')
    if (!componentId || !sectionId) return

    const resolved = runtime.componentState.resolveEntryValue(
      componentId,
      sectionId,
      readStringArray(payload, 'path'),
    )
    if (!resolved.found) return

    const varName = exposeValueAsGlobal(resolved.value)
    return varName ? { varName } : undefined
  })

  runtime.registerCommand('values:recompute', (command) => {
    const payload = command.payload
    const componentId = readString(payload, 'componentId')
    const sectionId = readString(payload, 'sectionId')
    const path = readStringArray(payload, 'path')
    if (!componentId || !sectionId || path.length < 1)
      return { status: 0, error: 'Invalid recompute payload' }

    const record = runtime.registry.getComponent(componentId, command.appId)
    if (!record) return { status: 0, error: 'Unknown component' }

    try {
      if (!runtime.componentState.recompute(componentId, sectionId, path))
        return { status: 0, error: 'Unable to recompute state entry' }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }

    runtime.events.dispatch({
      type: 'components:stateInvalidated',
      time: Date.now(),
      appId: record.appId,
      componentId: record.id,
      version: runtime.componentState.invalidate(record.id),
      reason: 'edit',
    })
    return { status: 1 }
  })

  runtime.registerCommand('components:cancelInspect', () => {
    cancelComponentInspection()
  })

  runtime.registerCommand('components:highlight', (command) => {
    const record = resolveComponentRecord(runtime, command.appId, command.payload)
    if (!record) return { status: 0, error: 'Unknown component' }
    return highlightComponentRecord(record)
      ? { status: 1 }
      : { status: 0, error: 'Component element is not available' }
  })

  runtime.registerCommand('components:unhighlight', () => {
    unhighlightComponent()
  })

  runtime.registerCommand('components:setHighlightUpdates', (command) => {
    highlight.setEnabled(readBoolean(command.payload, 'enabled') === true)
    return { status: 1 }
  })

  runtime.registerCommand('components:scrollTo', (command) => {
    const record = resolveComponentRecord(runtime, command.appId, command.payload)
    if (!record) return { status: 0, error: 'Unknown component' }
    return scrollToComponentRecord(record)
      ? { status: 1 }
      : { status: 0, error: 'Component element is not available' }
  })

  runtime.registerCommand('components:inspectDom', (command) => {
    const record = resolveComponentRecord(runtime, command.appId, command.payload)
    if (!record) return { status: 0, error: 'Unknown component' }
    return exposeComponentDomTarget(record)
      ? { status: 1 }
      : { status: 0, error: 'Component DOM target is not available' }
  })

  runtime.registerCommand('components:editState', async (command) => {
    const payload = command.payload
    const componentId =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { componentId?: unknown }).componentId === 'string'
        ? (payload as { componentId: string }).componentId
        : undefined
    const rawSectionId =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { sectionId?: unknown }).sectionId === 'string'
        ? (payload as { sectionId: string }).sectionId
        : undefined
    const rawPath =
      payload != null &&
      typeof payload === 'object' &&
      Array.isArray((payload as { path?: unknown }).path)
        ? (payload as { path: unknown[] }).path.filter(
            (segment): segment is string => typeof segment === 'string',
          )
        : []

    const sectionId = rawSectionId ?? rawPath[0]
    const path = rawSectionId ? rawPath : rawPath.slice(1)

    if (!componentId || !sectionId || path.length < 1)
      return { status: 0, error: 'Invalid state edit payload' }

    const record = runtime.registry.getComponent(componentId, command.appId)
    if (!record) return { status: 0, error: `Unknown component: ${componentId}` }

    const remove =
      payload != null &&
      typeof payload === 'object' &&
      (payload as { remove?: unknown }).remove === true
    const newKey =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { newKey?: unknown }).newKey === 'string'
        ? (payload as { newKey: string }).newKey
        : undefined
    let changed: boolean
    if (remove) {
      changed = runtime.componentState.delete(componentId, sectionId, path)
    } else {
      changed = runtime.componentState.edit(
        componentId,
        sectionId,
        path,
        (payload as { value: unknown }).value,
        newKey,
      )
    }

    const state = {
      value: (payload as { value?: unknown }).value,
      newKey,
      remove,
      type: readString(payload, 'stateType'),
    }
    await runtime.callPluginHook('editComponentState', {
      app: runtime.registry.getApp(record.appId)?.app,
      inspectorId: 'components',
      nodeId: componentId,
      componentInstance: record.instance,
      path,
      type: readString(payload, 'stateType') ?? sectionId,
      state,
      set: createLegacyStateSetter(state, () => {
        changed = true
      }),
    })

    // Legacy plugins own custom sections and may mutate their state directly,
    // without using the optional setter or returning an acknowledgement.
    const nativeSection = ['props', 'data', 'setup', 'computed'].includes(sectionId)
    if (!changed && nativeSection)
      return { status: 0, error: 'State path was not editable or no plugin handled the edit' }

    runtime.events.dispatch({
      type: 'components:stateInvalidated',
      time: Date.now(),
      appId: record.appId,
      componentId,
      version: runtime.componentState.invalidate(componentId),
      reason: 'edit',
    })
    return { status: 1 }
  })

  runtime.registerCommand('components:invalidate', (command) => {
    const componentId =
      command.payload != null &&
      typeof command.payload === 'object' &&
      typeof (command.payload as { componentId?: unknown }).componentId === 'string'
        ? (command.payload as { componentId: string }).componentId
        : undefined
    const record = componentId
      ? runtime.registry.getComponent(componentId, command.appId)
      : undefined
    if (!record) return { status: 1 }

    runtime.events.dispatch({
      type: 'components:stateInvalidated',
      time: Date.now(),
      appId: record.appId,
      componentId: record.id,
      version: runtime.componentState.invalidate(record.id),
      reason: 'edit',
    })
    return { status: 1 }
  })

  runtime.registerCommand('components:addState', (command) => {
    const payload = command.payload
    const componentId =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { componentId?: unknown }).componentId === 'string'
        ? (payload as { componentId: string }).componentId
        : undefined
    const rawSectionId =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { sectionId?: unknown }).sectionId === 'string'
        ? (payload as { sectionId: string }).sectionId
        : undefined
    const rawPath =
      payload != null &&
      typeof payload === 'object' &&
      Array.isArray((payload as { path?: unknown }).path)
        ? (payload as { path: unknown[] }).path.filter(
            (segment): segment is string => typeof segment === 'string',
          )
        : []

    const sectionId = rawSectionId ?? rawPath[0]
    const path = rawSectionId ? rawPath : rawPath.slice(1)

    if (!componentId || !sectionId || path.length < 1)
      return { status: 0, error: 'Invalid state add payload' }

    const record = runtime.registry.getComponent(componentId, command.appId)
    if (!record) return { status: 0, error: `Unknown component: ${componentId}` }

    const added = runtime.componentState.add(
      componentId,
      sectionId,
      path,
      payload != null && typeof payload === 'object'
        ? (payload as { value?: unknown }).value
        : undefined,
    )
    if (!added) return { status: 0, error: 'State entry does not support adding children' }

    runtime.events.dispatch({
      type: 'components:stateInvalidated',
      time: Date.now(),
      appId: record.appId,
      componentId,
      version: runtime.componentState.invalidate(componentId),
      reason: 'edit',
    })
    return { status: 1 }
  })

  runtime.registerCommand('values:customAction', async (command) => {
    const payload = command.payload
    const handle =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { handle?: unknown }).handle === 'string'
        ? (payload as { handle: string }).handle
        : undefined
    const actionIndex =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { actionIndex?: unknown }).actionIndex === 'number'
        ? (payload as { actionIndex: number }).actionIndex
        : undefined
    if (!handle || actionIndex == null) return { status: 0, error: 'Invalid custom action payload' }
    return (await runtime.componentState.executeCustomAction(handle, actionIndex))
      ? { status: 1 }
      : { status: 0, error: 'Custom action is not available' }
  })
}

async function applyVisitComponentTreeHooks(
  runtime: DevtoolsRuntime,
  nodes: ComponentSnapshot[],
  filter: string,
): Promise<void> {
  for (const node of nodes) {
    const record = runtime.registry.getComponent(node.id, node.appId)
    if (!record) continue

    node.tags ??= []
    await runtime.callPluginHook('visitComponentTree', {
      app: runtime.registry.getApp(record.appId)?.app,
      componentInstance: record.instance,
      treeNode: node,
      filter,
    })
    if (!node.tags.length) node.tags = undefined
  }
}

async function applyInspectComponentHooks(
  runtime: DevtoolsRuntime,
  record: ComponentRecord,
  snapshot: ComponentStateSnapshotMessage,
): Promise<void> {
  const legacyState = toLegacyStateEntries(snapshot)
  const originalLength = legacyState.length
  const instanceData = {
    id: record.id,
    name: record.name,
    file: record.file,
    state: legacyState,
  }

  await runtime.callPluginHook('inspectComponent', {
    app: runtime.registry.getApp(record.appId)?.app,
    componentInstance: record.instance,
    instanceData,
  })

  runtime.componentState.appendLegacyEntries(
    snapshot,
    legacyState.slice(originalLength).filter(isLegacyStateEntry),
  )
}

function toLegacyStateEntries(
  snapshot: ComponentStateSnapshotMessage,
): LegacyComponentStateEntry[] {
  return snapshot.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      type: section.id,
      key: entry.key,
      value: entry.value,
      editable: entry.editable,
      meta: entry.meta,
    })),
  )
}

function isLegacyStateEntry(value: unknown): value is LegacyComponentStateEntry {
  return value != null && typeof value === 'object'
}

function resolveComponentRecord(
  runtime: DevtoolsRuntime,
  appId: string | undefined,
  payload: unknown,
): ComponentRecord | undefined {
  if (payload == null || typeof payload !== 'object') return

  const componentId =
    typeof (payload as { componentId?: unknown }).componentId === 'string'
      ? (payload as { componentId: string }).componentId
      : undefined
  if (componentId) return runtime.registry.getComponent(componentId, appId)

  const instance =
    (payload as { instance?: unknown }).instance != null &&
    typeof (payload as { instance?: unknown }).instance === 'object'
      ? ((payload as { instance: object }).instance as object)
      : undefined
  const instanceId = instance ? runtime.registry.getComponentId(instance) : undefined
  return instanceId ? runtime.registry.getComponent(instanceId, appId) : undefined
}

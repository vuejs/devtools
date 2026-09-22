import type {
  ComponentStateSnapshotMessage,
  EncodedValue,
  RuntimeCommandRequest,
  RuntimeQueryRequest,
  StateEntry,
} from '@vue/devtools-kit'
import type { DevtoolsRpcClient } from '@vue/devtools-kit/client'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'

type CustomEncodedValue = Extract<EncodedValue, { kind: 'custom' }>
const DEFAULT_STATE_SHOW_MORE_SIZE = 30

interface DevtoolsStateOptions {
  getRpcClient: () => DevtoolsRpcClient | undefined
  runtimeVersion: Ref<number>
  selectedAppId: Ref<string | undefined>
  selectedComponentId: Ref<string | undefined>
  error: Ref<string | undefined>
  assertCommandSucceeded: (result: { status: 0 | 1; error?: unknown }, fallback: string) => void
}

export function createDevtoolsState(options: DevtoolsStateOptions) {
  const {
    getRpcClient,
    runtimeVersion,
    selectedAppId,
    selectedComponentId,
    error,
    assertCommandSucceeded,
  } = options
  const componentState = ref<ComponentStateSnapshotMessage>()
  const componentStateLoading = ref(false)
  const componentStateMaxEntries = ref<number>()
  const expandedValues = ref<Record<string, EncodedValue>>({})
  const inspectorInvalidations = ref<
    Record<string, { tree: number; state: number; nodeId?: string }>
  >({})
  let expandedValuesVersion = 0
  let stateRequestSeed = 0
  let stateContextVersion = 0
  let pendingStateRequest:
    | {
        key: string
        maxEntries?: number
        minimumVersion: number
        promise: Promise<void>
      }
    | undefined
  const stateMutations = new Map<
    string,
    { pending: number; refresh: boolean; minimumVersion: number }
  >()

  watch([runtimeVersion, selectedAppId, selectedComponentId], resetComponentStateRequests, {
    flush: 'sync',
  })

  watch(selectedComponentId, (componentId) => {
    if (componentId) void fetchComponentState(componentId)
  })

  function componentStateRequestKey(componentId: string) {
    return `${stateContextVersion}:${selectedAppId.value}:${componentId}`
  }

  function resetComponentStateRequests() {
    stateContextVersion++
    stateRequestSeed++
    pendingStateRequest = undefined
    stateMutations.clear()
    componentState.value = undefined
    componentStateMaxEntries.value = undefined
    componentStateLoading.value = false
    clearExpandedValues()
  }

  async function fetchComponentState(componentId: string, minimumVersion = 0): Promise<void> {
    const client = getRpcClient()
    if (!client) return
    const appId = selectedAppId.value
    const key = componentStateRequestKey(componentId)
    const mutation = stateMutations.get(key)
    if (mutation) {
      mutation.refresh = true
      mutation.minimumVersion = Math.max(mutation.minimumVersion, minimumVersion)
      return
    }
    if (
      minimumVersion &&
      componentState.value?.componentId === componentId &&
      componentState.value.version >= minimumVersion
    )
      return

    if (
      pendingStateRequest?.key === key &&
      pendingStateRequest.maxEntries === componentStateMaxEntries.value
    ) {
      pendingStateRequest.minimumVersion = Math.max(
        pendingStateRequest.minimumVersion,
        minimumVersion,
      )
      return pendingStateRequest.promise
    }

    const requestId = ++stateRequestSeed
    componentStateLoading.value = true
    const request = {
      key,
      maxEntries: componentStateMaxEntries.value,
      minimumVersion,
      promise: Promise.resolve(),
    }
    pendingStateRequest = request
    request.promise = refresh()
    return request.promise

    async function refresh() {
      try {
        while (true) {
          const requestedVersion = request.minimumVersion
          const snapshot = await client!.query({
            type: 'components:stateSnapshot',
            appId,
            payload: { componentId, maxEntries: request.maxEntries },
          })
          if (
            requestId !== stateRequestSeed ||
            key !== componentStateRequestKey(componentId) ||
            componentId !== selectedComponentId.value
          )
            return
          // An invalidation received during this request may describe newer state.
          if (
            snapshot &&
            snapshot.version < request.minimumVersion &&
            request.minimumVersion > requestedVersion
          )
            continue
          clearExpandedValues()
          componentState.value = snapshot
          return
        }
      } catch (err) {
        if (requestId === stateRequestSeed)
          error.value = err instanceof Error ? err.message : String(err)
      } finally {
        if (pendingStateRequest === request) pendingStateRequest = undefined
        if (requestId === stateRequestSeed) componentStateLoading.value = false
      }
    }
  }

  async function mutateComponentState(
    componentId: string,
    command: RuntimeCommandRequest,
    message: string,
  ) {
    const client = getRpcClient()
    if (!client) return
    const key = componentStateRequestKey(componentId)
    const mutation = stateMutations.get(key) ?? { pending: 0, refresh: false, minimumVersion: 0 }
    if (pendingStateRequest?.key === key) {
      // Preserve the pending refresh even if the edit fails.
      mutation.refresh = true
      mutation.minimumVersion = Math.max(
        mutation.minimumVersion,
        pendingStateRequest.minimumVersion,
      )
      stateRequestSeed++
      pendingStateRequest = undefined
      componentStateLoading.value = false
    }
    mutation.pending++
    stateMutations.set(key, mutation)
    try {
      assertCommandSucceeded(await client.command(command), message)
      mutation.refresh = true
    } finally {
      mutation.pending--
      if (!mutation.pending) {
        stateMutations.delete(key)
        if (
          mutation.refresh &&
          key === componentStateRequestKey(componentId) &&
          componentId === selectedComponentId.value
        ) {
          clearExpandedValues()
          await fetchComponentState(componentId, mutation.minimumVersion)
        }
      }
    }
  }

  async function fetchInspectorState(
    inspectorId: string,
    nodeId: string,
  ): Promise<ComponentStateSnapshotMessage | undefined> {
    const client = getRpcClient()
    if (!client || !nodeId) return

    return await client.query({
      type: 'inspectors:stateSnapshot',
      appId: selectedAppId.value,
      payload: {
        inspectorId,
        nodeId,
      },
    })
  }

  async function selectInspectorNode(inspectorId: string, nodeId: string) {
    const client = getRpcClient()
    await client
      ?.command({
        type: 'inspectors:selectNode',
        appId: selectedAppId.value,
        payload: {
          inspectorId,
          nodeId,
        },
      })
      .catch(() => {})
  }

  async function showMoreComponentStateEntries() {
    const componentId = selectedComponentId.value
    if (!componentId) return

    const currentMax = Math.max(
      0,
      ...(componentState.value?.sections.map((section) => section.entries.length) ?? []),
    )
    componentStateMaxEntries.value =
      (componentStateMaxEntries.value ?? currentMax) + DEFAULT_STATE_SHOW_MORE_SIZE
    await fetchComponentState(componentId)
  }

  async function expandEntryValue(entry: StateEntry, maxEntries?: number) {
    const value = getEntryValue(entry)
    const handle = getValueHandle(getDisplayEncodedValue(value))
    const client = getRpcClient()
    if (!handle || !client) return

    const entryKey = getEntryKey(entry)
    const version = expandedValuesVersion
    const expanded = await client.query({
      type: 'values:expand',
      appId: selectedAppId.value,
      payload: { handle, maxEntries },
    })
    if (!expanded) return

    // Clearing a snapshot or selection also invalidates its in-flight expansions.
    if (version !== expandedValuesVersion || getEntryKey(entry) !== entryKey) return

    expandedValues.value = {
      ...expandedValues.value,
      [entryKey]: replaceDisplayEncodedValue(value, expanded.value),
    }
  }

  async function storeStateEntryAsGlobal(entry: StateEntry): Promise<string | undefined> {
    const client = getRpcClient()
    if (!client) return

    const value = getEntryValue(entry)
    const displayHandle = getValueHandle(getDisplayEncodedValue(value))
    const inspectorEntry = getInspectorEntryMeta(entry)
    const componentId = selectedComponentId.value

    let payload: RuntimeQueryRequest<'values:storeAsGlobal'>['payload'] | undefined
    if (displayHandle) {
      payload = { handle: displayHandle }
    } else if (!inspectorEntry && componentId && entry.path.length >= 1) {
      const [sectionId, ...path] = entry.path
      payload = { componentId, sectionId, path }
    } else {
      const customHandle = getCustomEncodedValue(value)?.handle
      if (customHandle) payload = { handle: customHandle }
    }
    if (!payload) return

    const result = await client.query({
      type: 'values:storeAsGlobal',
      appId: selectedAppId.value,
      payload,
    })
    return result?.varName
  }

  function isComputedStateEntry(entry: StateEntry): boolean {
    if (getInspectorEntryMeta(entry) || entry.path.length !== 2) return false
    if (entry.meta?.stateType === 'computed') return true
    return entry.path[0] === 'computed'
  }

  async function recomputeStateEntry(entry: StateEntry): Promise<void> {
    const client = getRpcClient()
    const componentId = selectedComponentId.value
    if (!client || !componentId || !isComputedStateEntry(entry)) return

    const [sectionId, ...path] = entry.path
    const result = await client.command({
      type: 'values:recompute',
      appId: selectedAppId.value,
      payload: { componentId, sectionId, path },
    })
    if (result.status !== 1) {
      throw new Error(
        typeof result.error === 'string' ? result.error : 'Unable to recompute computed value',
      )
    }

    clearExpandedValues()
    await fetchComponentState(componentId)
  }

  async function editComponentState(entry: StateEntry, value: unknown) {
    const inspectorEntry = getInspectorEntryMeta(entry)
    if (inspectorEntry) return editInspectorState(entry, value, inspectorEntry)

    const client = getRpcClient()
    const componentId = selectedComponentId.value
    if (!client || !componentId) return

    const [sectionId, ...path] = entry.path
    await mutateComponentState(
      componentId,
      {
        type: 'components:editState',
        appId: selectedAppId.value,
        payload: {
          componentId,
          sectionId,
          path,
          stateType: typeof entry.meta?.stateType === 'string' ? entry.meta.stateType : undefined,
          value,
        },
      },
      'Unable to edit state entry',
    )
  }

  async function deleteComponentState(entry: StateEntry) {
    const inspectorEntry = getInspectorEntryMeta(entry)
    if (inspectorEntry) return deleteInspectorState(entry, inspectorEntry)

    const client = getRpcClient()
    const componentId = selectedComponentId.value
    if (!client || !componentId) return

    const [sectionId, ...path] = entry.path
    await mutateComponentState(
      componentId,
      {
        type: 'components:editState',
        appId: selectedAppId.value,
        payload: {
          componentId,
          sectionId,
          path,
          remove: true,
        },
      },
      'Unable to delete state entry',
    )
  }

  async function addComponentStateEntry(parentEntry: StateEntry) {
    if (getInspectorEntryMeta(parentEntry))
      throw new Error('Adding inspector state entries is not supported')

    const client = getRpcClient()
    const componentId = selectedComponentId.value
    if (!client || !componentId) return

    const [sectionId, ...path] = parentEntry.path
    await mutateComponentState(
      componentId,
      {
        type: 'components:addState',
        appId: selectedAppId.value,
        payload: {
          componentId,
          sectionId,
          path,
          value: undefined,
        },
      },
      'Unable to add state entry',
    )
  }

  async function executeCustomStateAction(entry: StateEntry, actionIndex: number) {
    const client = getRpcClient()
    if (!client) return

    const value = getEntryValue(entry)
    const handle = getCustomEncodedValue(value)?.handle
    if (!handle) return

    const result = await client.command({
      type: 'values:customAction',
      appId: selectedAppId.value,
      payload: { handle, actionIndex },
    })
    assertCommandSucceeded(result, 'Unable to run custom state action')

    const inspectorEntry = getInspectorEntryMeta(entry)
    if (inspectorEntry)
      touchInspectorInvalidation(inspectorEntry.inspectorId, 'state', inspectorEntry.nodeId)
    else if (selectedComponentId.value) await fetchComponentState(selectedComponentId.value)
  }

  async function editInspectorState(
    entry: StateEntry,
    value: unknown,
    inspectorEntry: { inspectorId: string; nodeId: string },
  ) {
    const client = getRpcClient()
    if (!client) return

    const [sectionId, ...path] = entry.path
    const result = await client.command({
      type: 'inspectors:editState',
      appId: selectedAppId.value,
      payload: {
        inspectorId: inspectorEntry.inspectorId,
        nodeId: inspectorEntry.nodeId,
        sectionId,
        path,
        value,
      },
    })

    assertCommandSucceeded(result, 'Unable to edit inspector state')
    clearExpandedValues()
    touchInspectorInvalidation(inspectorEntry.inspectorId, 'state', inspectorEntry.nodeId)
  }

  async function deleteInspectorState(
    entry: StateEntry,
    inspectorEntry: { inspectorId: string; nodeId: string },
  ) {
    const client = getRpcClient()
    if (!client) return

    const [sectionId, ...path] = entry.path
    const result = await client.command({
      type: 'inspectors:editState',
      appId: selectedAppId.value,
      payload: {
        inspectorId: inspectorEntry.inspectorId,
        nodeId: inspectorEntry.nodeId,
        sectionId,
        path,
        remove: true,
      },
    })

    assertCommandSucceeded(result, 'Unable to delete inspector state')
    clearExpandedValues()
    touchInspectorInvalidation(inspectorEntry.inspectorId, 'state', inspectorEntry.nodeId)
  }

  function getEntryKey(entry: StateEntry): string {
    const inspectorEntry = getInspectorEntryMeta(entry)
    const scope = inspectorEntry
      ? ['inspector', inspectorEntry.inspectorId, inspectorEntry.nodeId]
      : selectedComponentId.value
        ? ['component', selectedComponentId.value]
        : ['state']
    return JSON.stringify([runtimeVersion.value, selectedAppId.value, ...scope, entry.path])
  }

  function getEntryValue(entry: StateEntry): EncodedValue {
    return expandedValues.value[getEntryKey(entry)] ?? entry.value
  }

  function getValueHandle(value: EncodedValue): string | undefined {
    return 'handle' in value ? value.handle : undefined
  }

  function getDisplayEncodedValue(value: EncodedValue): EncodedValue {
    const custom = getCustomEncodedValue(value)
    return custom ? getDisplayEncodedValue(custom.value) : value
  }

  function replaceDisplayEncodedValue(
    value: EncodedValue,
    replacement: EncodedValue,
  ): EncodedValue {
    const custom = getCustomEncodedValue(value)
    if (!custom) return replacement

    return {
      ...custom,
      value: replaceDisplayEncodedValue(custom.value, replacement),
    }
  }

  function clearExpandedValues() {
    expandedValuesVersion++
    expandedValues.value = {}
  }

  function touchInspectorInvalidation(
    inspectorId: string,
    type: 'tree' | 'state',
    nodeId?: string,
  ) {
    const current = inspectorInvalidations.value[inspectorId] ?? { tree: 0, state: 0 }
    inspectorInvalidations.value = {
      ...inspectorInvalidations.value,
      [inspectorId]: {
        ...current,
        [type]: current[type] + 1,
        ...(type === 'state' ? { nodeId } : {}),
      },
    }
  }

  function getInspectorEntryMeta(
    entry: StateEntry,
  ): { inspectorId: string; nodeId: string } | undefined {
    const inspectorId = entry.meta?.inspectorId
    const nodeId = entry.meta?.nodeId
    return typeof inspectorId === 'string' && typeof nodeId === 'string'
      ? { inspectorId, nodeId }
      : undefined
  }

  function formatValue(value: EncodedValue): string {
    if (!value || typeof value !== 'object') return 'SerializationError'
    const custom = getCustomEncodedValue(value)
    if (custom)
      return (
        custom.display ??
        (custom.value && typeof custom.value === 'object'
          ? formatValue(custom.value)
          : 'SerializationError')
      )

    switch (value.kind) {
      case 'null':
      case 'undefined':
        return value.kind
      case 'boolean':
      case 'bigint':
        return String(value.value)
      case 'number':
        return String(value.value)
      case 'string':
        return value.truncated ? `"${value.value}"...` : `"${value.value}"`
      case 'symbol':
        return `Symbol(${value.description})`
      case 'function':
        return `ƒ ${value.name ?? 'anonymous'}()`
      case 'array':
        return `Array(${value.length})`
      case 'object':
        return value.name
      case 'map':
        return `Map(${value.size})`
      case 'set':
        return `Set(${value.size})`
      case 'component':
        return `<${value.name}>`
      case 'dom':
        return `<${value.tag}${value.id ? `#${value.id}` : ''}>`
      case 'date':
      case 'regexp':
        return value.value
      case 'error':
        return `${value.name}: ${value.message}`
      case 'circular':
        return `[Circular ${value.handle}]`
    }

    return ''
  }

  function getCustomEncodedValue(value: unknown): CustomEncodedValue | undefined {
    if (
      value != null &&
      typeof value === 'object' &&
      (value as { kind?: unknown }).kind === 'custom'
    ) {
      return value as CustomEncodedValue
    }
  }

  return {
    componentState,
    componentStateLoading,
    expandedValues,
    inspectorInvalidations,
    fetchComponentState,
    resetComponentStateRequests,
    fetchInspectorState,
    selectInspectorNode,
    showMoreComponentStateEntries,
    expandEntryValue,
    storeStateEntryAsGlobal,
    isComputedStateEntry,
    recomputeStateEntry,
    editComponentState,
    deleteComponentState,
    addComponentStateEntry,
    executeCustomStateAction,
    getEntryKey,
    getEntryValue,
    clearExpandedValues,
    touchInspectorInvalidation,
    formatValue,
  }
}

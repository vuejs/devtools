import type {
  AppSnapshot,
  DevtoolsCapabilitiesMessage,
  ComponentTreeNodeSnapshot as ComponentSnapshot,
  ComponentInspectionResultMessage as ComponentInspectionResult,
  InspectorsListMessage as InspectorsSnapshotResult,
  CustomInspectorTreeNode,
  PluginSnapshot,
  ComponentTreePatch,
  RouterRouteRecordSnapshot,
  RouterSnapshotMessage,
} from '@vue/devtools-kit'
import { supportsReactivityGraphVueVersion } from '@vue/devtools-kit'
import type { DevToolsRpcClient } from '@vitejs/devtools-kit/client'
import type { DevtoolsRpcClient } from '@vue/devtools-kit/client'
import { computed, ref, shallowRef, watch } from 'vue'
import { applyComponentTreePatches as patchComponentTree } from '../utils/component-tree-patches'
import { createDevtoolsConnection } from './devtools-connection'
import { createDevtoolsTimeline } from './devtools-timeline'
import { createDevtoolsState } from './devtools-state'
import { useDevtoolsSettings } from './settings'
import { createComponentTreeLoader } from './component-tree-loader'

export type { TimelineEntry, TimelineLayerEntry } from './devtools-timeline'

export type {
  AppSnapshot,
  ComponentTreeNodeTag,
  CustomInspectorTreeNode,
  PluginSnapshot,
  PluginSettingOption,
  PluginSettingsItem as PluginSettingSchema,
  ComponentTreeNodeSnapshot as ComponentSnapshot,
} from '@vue/devtools-kit'

export type CustomInspectorSnapshot = InspectorsSnapshotResult['inspectors'][number]

const emptyRouterSnapshot: RouterSnapshotMessage = { routes: [] }

const apps = shallowRef<AppSnapshot[]>([])
const components = shallowRef<ComponentSnapshot[]>([])
const inspectors = shallowRef<CustomInspectorSnapshot[]>([])
const plugins = shallowRef<PluginSnapshot[]>([])
const routerSnapshot = ref<RouterSnapshotMessage>(emptyRouterSnapshot)
const selectedAppId = ref<string>()
const selectedComponentId = ref<string>()
const loading = ref(false)
const runtimeVersion = ref(0)
let refreshVersion = 0
const lastUpdatedAt = ref<number>()
const capabilities = ref<DevtoolsCapabilitiesMessage>({ openInEditor: false })
const selectedApp = computed(
  () => apps.value.find((app) => app.id === selectedAppId.value) ?? apps.value[0],
)
const selectedComponent = computed(() =>
  components.value.find((component) => component.id === selectedComponentId.value),
)
const pageCount = computed(() => {
  if (!apps.value.length) return 0
  return Math.max(routerSnapshot.value.routes.length, 1)
})
const reactivityGraphEnabled = computed(() =>
  supportsReactivityGraphVueVersion(selectedApp.value?.version),
)
const totalComponents = computed(() => apps.value.reduce((sum, app) => sum + app.componentCount, 0))
const openInEditorAvailable = computed(() => capabilities.value.openInEditor)

const connection = createDevtoolsConnection({
  refresh: refreshData,
  onRuntimeChanged: resetFrameScopedState,
  onDisconnect() {
    invalidateRefresh()
    discardPendingTimelineEvents()
    capabilities.value = { openInEditor: false }
  },
})
const {
  connected,
  error,
  frames,
  activeFrameId,
  getRpcClient,
  getViteRpcClient,
  selectFrame,
  scheduleConnectionRetry,
  scheduleConnectionHealthCheck,
  disconnectRpcClient,
  clearConnectionRetryTimer,
  listenRuntimeEvents,
} = connection
const {
  timeline,
  timelineLayers,
  timelineRecording,
  disabledTimelineLayerIds,
  selectedTimelineLayerId,
  clearTimelineEvents,
  toggleTimelineRecording,
  inspectTimelineEvent,
  toggleTimelineLayerEnabled,
  isTimelineLayerEnabled,
  selectTimelineLayer,
  syncTimelineSettings,
  formatTime,
  discardPendingTimelineEvents,
  handleTimelineEvent,
  resetTimeline,
} = createDevtoolsTimeline(getRpcClient)
const componentInspecting = ref(false)
const componentTreeLoader = createComponentTreeLoader({
  getClient: getRpcClient,
  getAppId: () => selectedAppId.value,
  getParentId: (id) => components.value.find((node) => node.id === id)?.parentId,
  apply: applyComponentTreePatches,
  onError: (err) => {
    error.value = formatCommandError(err, 'Unable to expand component tree node')
  },
})
watch([selectedAppId, runtimeVersion], () => componentTreeLoader.cancel(), { flush: 'sync' })
const {
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
} = createDevtoolsState({
  getRpcClient,
  runtimeVersion,
  selectedAppId,
  selectedComponentId,
  error,
  assertCommandSucceeded,
})

watch(
  selectedApp,
  (app) => {
    if (app && app.id !== selectedAppId.value) selectedAppId.value = app.id
  },
  { immediate: true },
)

watch(components, (nodes) => {
  if (!nodes.some((component) => component.id === selectedComponentId.value))
    selectedComponentId.value = nodes[0]?.id
})

const { settings } = useDevtoolsSettings()
watch([connected, () => settings.highlightUpdates], ([isConnected, highlightUpdates]) => {
  if (!isConnected) return
  void getRpcClient()
    ?.command({
      type: 'components:setHighlightUpdates',
      payload: { enabled: highlightUpdates },
    })
    .catch(() => {})
})

export function useDevtoolsClient() {
  return {
    apps,
    components,
    componentState,
    componentStateLoading,
    componentInspecting,
    connected,
    addComponentStateEntry,
    deleteComponentState,
    error,
    expandedValues,
    frames,
    activeFrameId,
    inspectors,
    inspectorInvalidations,
    lastUpdatedAt,
    loading,
    plugins,
    pageCount,
    reactivityGraphEnabled,
    routerSnapshot,
    runtimeVersion,
    selectedApp,
    selectedAppId,
    selectedComponent,
    selectedComponentId,
    selectedTimelineLayerId,
    timeline,
    disabledTimelineLayerIds,
    timelineLayers,
    timelineRecording,
    totalComponents,
    callInspectorAction,
    callInspectorNodeAction,
    openInEditorAvailable,
    clearExpandedValues,
    editComponentState,
    expandComponentTreeNode,
    cancelComponentTreeExpansion: componentTreeLoader.cancel,
    expandEntryValue,
    fetchInspectorState,
    fetchInspectorTree,
    formatTime,
    formatValue,
    getMatchedRoutes,
    getEntryKey,
    getEntryValue,
    getSelectedComponentRenderCode,
    highlightComponent,
    inspectSelectedComponentDom,
    openSelectedComponentInEditor,
    openFileInEditor,
    navigateRoute,
    updatePluginSetting,
    executeCustomStateAction,
    cancelComponentInspection,
    clearTimelineEvents,
    refreshData,
    inspectComponentInPage,
    inspectTimelineEvent,
    isTimelineLayerEnabled,
    scrollToSelectedComponent,
    selectApp,
    selectComponent,
    selectFrame,
    selectInspectorNode,
    selectTimelineLayer,
    showMoreComponentStateEntries,
    storeStateEntryAsGlobal,
    isComputedStateEntry,
    recomputeStateEntry,
    toggleTimelineLayerEnabled,
    toggleTimelineRecording,
    unhighlightComponent,
  }
}

export function startDevtoolsClient() {
  connection.start()
}

export function stopDevtoolsClient() {
  connection.stop()
}

function invalidateRefresh() {
  refreshVersion++
  loading.value = false
  connected.value = false
  runtimeVersion.value++
}

async function refreshData() {
  componentTreeLoader.cancel()
  const version = ++refreshVersion
  const requestedAppId = selectedAppId.value
  const isCurrent = () => version === refreshVersion && requestedAppId === selectedAppId.value
  const client = getRpcClient()
  if (!client) {
    connected.value = false
    apps.value = []
    components.value = []
    inspectors.value = []
    plugins.value = []
    routerSnapshot.value = emptyRouterSnapshot
    resetComponentStateRequests()
    error.value = 'Waiting for host runtime'
    loading.value = false
    scheduleConnectionRetry()
    return
  }

  loading.value = true
  try {
    const [appSnapshot, nextCapabilities, pluginSnapshot] = await Promise.all([
      client.query({ type: 'apps:snapshot' }),
      client.query({ type: 'devtools:capabilities' }).catch(() => ({ openInEditor: false })),
      client.query({ type: 'plugins:snapshot' }),
    ])
    if (!isCurrent()) return
    const appId = appSnapshot.apps.some((app) => app.id === requestedAppId)
      ? requestedAppId
      : appSnapshot.apps[0]?.id
    const [componentSnapshot, nextRouter, inspectorSnapshot] = await Promise.all([
      client.query({ type: 'components:treeSnapshot', appId }),
      fetchRouterSnapshot(client, appId),
      fetchInspectorsSnapshot(client, appId),
    ])
    if (!isCurrent()) return

    // Commit one consistent snapshot; no awaited work may publish an older selection.
    apps.value = appSnapshot.apps
    selectedAppId.value = appId
    components.value = componentSnapshot.nodes
    capabilities.value = nextCapabilities
    routerSnapshot.value = nextRouter
    plugins.value = pluginSnapshot.plugins
    inspectors.value = inspectorSnapshot.inspectors
    connected.value = true
    error.value = undefined
    lastUpdatedAt.value = Date.now()
    attachRuntimeEvents(client)
    void syncTimelineSettings(client)
    clearConnectionRetryTimer()
    scheduleConnectionHealthCheck()
    if (selectedComponentId.value) void fetchComponentState(selectedComponentId.value)
  } catch (err) {
    if (!isCurrent()) return
    error.value = err instanceof Error ? err.message : String(err)
    disconnectRpcClient()
    scheduleConnectionRetry()
  } finally {
    if (version === refreshVersion) loading.value = false
  }
}

async function fetchRouterSnapshot(
  client: DevtoolsRpcClient,
  appId: string | undefined,
): Promise<RouterSnapshotMessage> {
  try {
    return await client.query({
      type: 'router:snapshot',
      appId,
    })
  } catch {
    return { ...emptyRouterSnapshot, appId }
  }
}

async function getMatchedRoutes(path: string): Promise<RouterRouteRecordSnapshot[]> {
  const client = getRpcClient()
  if (!client) return []

  try {
    const result = await client.query({
      type: 'router:matchedRoutes',
      appId: selectedAppId.value,
      payload: { path },
    })
    return result.routes ?? []
  } catch {
    return []
  }
}

let routerRefreshVersion = 0

async function refreshRouterSnapshot(client: DevtoolsRpcClient) {
  const requestVersion = ++routerRefreshVersion
  const version = refreshVersion
  const appId = selectedAppId.value
  const snapshot = await fetchRouterSnapshot(client, appId)
  if (
    requestVersion === routerRefreshVersion &&
    version === refreshVersion &&
    appId === selectedAppId.value
  )
    routerSnapshot.value = snapshot
}

async function navigateRoute(path: string) {
  const client = getRpcClient()
  if (!client) return
  const appId = selectedAppId.value
  const version = refreshVersion
  const isCurrent = () => version === refreshVersion && appId === selectedAppId.value
  const result = await client.command({
    type: 'router:navigate',
    appId,
    payload: { path },
  })
  if (!isCurrent()) return
  assertCommandSucceeded(result, 'Unable to navigate route')
  await refreshRouterSnapshot(client)
}

function resetFrameScopedState() {
  invalidateRefresh()
  apps.value = []
  components.value = []
  inspectors.value = []
  inspectorInvalidations.value = {}
  plugins.value = []
  routerSnapshot.value = emptyRouterSnapshot
  selectedAppId.value = undefined
  selectedComponentId.value = undefined
  resetTimeline()
}

function attachRuntimeEvents(client: DevtoolsRpcClient) {
  listenRuntimeEvents(client, (event) => {
    handleTimelineEvent(event)

    if (event.type === 'components:treePatched') {
      if (!event.appId || event.appId !== selectedAppId.value) return
      componentTreeLoader.observe(event.patches ?? [])
      applyComponentTreePatches(event.patches ?? [])
      lastUpdatedAt.value = Date.now()
      return
    }

    if (event.type === 'components:stateInvalidated') {
      const componentId = event.componentId
      if (
        componentId &&
        componentId === selectedComponentId.value &&
        event.appId === selectedAppId.value
      )
        void fetchComponentState(componentId, event.version)
      return
    }

    if (event.type === 'apps:changed') {
      void refreshData()
      return
    }

    if (event.type === 'plugin:setup' || event.type === 'inspectors:changed') {
      void refreshData()
      return
    }

    if (event.appId && event.appId !== selectedAppId.value) return

    if (event.type === 'inspectors:treeInvalidated' && event.inspectorId) {
      touchInspectorInvalidation(event.inspectorId, 'tree')
      // Vue Router invalidates its inspector tree after page-side navigation.
      // Pages consumes a separate snapshot and must refresh it as well.
      if (event.inspectorId.startsWith('router-inspector:')) void refreshRouterSnapshot(client)
    }

    if (event.type === 'inspectors:stateInvalidated' && event.inspectorId) {
      touchInspectorInvalidation(event.inspectorId, 'state', event.nodeId)
    }
  })
}

function applyComponentTreePatches(patches: ComponentTreePatch[]) {
  components.value = patchComponentTree(components.value, patches)
}

async function fetchInspectorsSnapshot(
  client: DevtoolsRpcClient,
  appId: string | undefined,
): Promise<InspectorsSnapshotResult> {
  try {
    return await client.query({
      type: 'inspectors:list',
      appId,
    })
  } catch {
    return { inspectors: [] }
  }
}

async function fetchInspectorTree(
  inspectorId: string,
  filter = '',
): Promise<CustomInspectorTreeNode[]> {
  const client = getRpcClient()
  if (!client) return []

  const snapshot = await client.query({
    type: 'inspectors:treeSnapshot',
    appId: selectedAppId.value,
    payload: {
      inspectorId,
      filter,
    },
  })

  return snapshot.rootNodes ?? []
}

async function updatePluginSetting(pluginId: string, key: string, value: unknown) {
  const client = getRpcClient()
  if (!client) return

  const result = await client.command({
    type: 'plugins:updateSetting',
    payload: { pluginId, key, value },
  })
  assertCommandSucceeded(result, 'Unable to update plugin setting')

  plugins.value = plugins.value.map((plugin) =>
    plugin.id === pluginId
      ? {
          ...plugin,
          settingValues: {
            ...plugin.settingValues,
            [key]: value,
          },
        }
      : plugin,
  )
}

async function callInspectorAction(inspectorId: string, actionIndex: number) {
  const client = getRpcClient()
  if (!client) return

  const result = await client.command({
    type: 'inspectors:callAction',
    appId: selectedAppId.value,
    payload: {
      inspectorId,
      actionIndex,
    },
  })
  assertCommandSucceeded(result, 'Unable to run inspector action')
}

async function callInspectorNodeAction(inspectorId: string, nodeId: string, actionIndex: number) {
  const client = getRpcClient()
  if (!client || !nodeId) return

  const result = await client.command({
    type: 'inspectors:callNodeAction',
    appId: selectedAppId.value,
    payload: {
      inspectorId,
      nodeId,
      actionIndex,
    },
  })
  assertCommandSucceeded(result, 'Unable to run inspector node action')
}

async function inspectComponentInPage(): Promise<ComponentInspectionResult | undefined> {
  const client = getRpcClient()
  if (!client) return

  componentInspecting.value = true

  try {
    const result = await client.query({
      type: 'components:inspect',
    })
    if (!result) return

    if (result.appId !== selectedAppId.value) {
      selectedAppId.value = result.appId
      componentState.value = undefined
      clearExpandedValues()
      await refreshData()
    }

    if (result.nodes) {
      applyComponentTreePatches(
        result.nodes.map((node) => ({
          op: 'insert' as const,
          parentId: node.parentId,
          node,
        })),
      )
    }
    selectedComponentId.value = result.componentId
    return result
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    componentInspecting.value = false
  }
}

async function highlightComponent(componentId: string) {
  const client = getRpcClient()
  if (!client) return

  await client
    .command({
      type: 'components:highlight',
      appId: selectedAppId.value,
      payload: { componentId },
    })
    .catch(() => {})
}

async function unhighlightComponent() {
  const client = getRpcClient()
  await client?.command({ type: 'components:unhighlight' }).catch(() => {})
}

async function scrollToSelectedComponent() {
  const client = getRpcClient()
  const componentId = selectedComponentId.value
  if (!client || !componentId) return

  const result = await client.command({
    type: 'components:scrollTo',
    appId: selectedAppId.value,
    payload: { componentId },
  })
  assertCommandSucceeded(result, 'Unable to scroll to component')
}

async function inspectSelectedComponentDom() {
  const client = getRpcClient()
  const componentId = selectedComponentId.value
  if (!client || !componentId) return

  const result = await client.command({
    type: 'components:inspectDom',
    appId: selectedAppId.value,
    payload: { componentId },
  })
  assertCommandSucceeded(result, 'Unable to inspect DOM')
}

async function getSelectedComponentRenderCode(): Promise<string | undefined> {
  const client = getRpcClient()
  const componentId = selectedComponentId.value
  if (!client || !componentId) return

  const code = await client.query({
    type: 'components:getRenderCode',
    appId: selectedAppId.value,
    payload: { componentId },
  })

  if (!code) {
    error.value = 'No render code available for this component'
    return
  }

  return code
}

async function openSelectedComponentInEditor() {
  const file = selectedComponent.value?.file
  if (!file) {
    error.value = 'No source file available for this component'
    return
  }

  await openFileInEditor(file)
}

async function openFileInEditor(file: string) {
  if (!openInEditorAvailable.value) return

  const rpc = await getViteRpcClient()
  await callViteRpc(rpc, 'vite:core:open-in-editor', file)
}

async function cancelComponentInspection() {
  const client = getRpcClient()
  componentInspecting.value = false
  await client?.command({ type: 'components:cancelInspect' })
}

function callViteRpc(rpc: DevToolsRpcClient, name: string, ...args: unknown[]) {
  return (rpc.call as (name: string, ...args: unknown[]) => Promise<unknown>)(name, ...args)
}

function assertCommandSucceeded(result: { status: 0 | 1; error?: unknown }, fallback: string) {
  if (result.status === 1) return
  const message = formatCommandError(result.error, fallback)
  error.value = message
  throw new Error(message)
}

function formatCommandError(value: unknown, fallback: string): string {
  if (value == null) return fallback
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function selectComponent(componentId: string) {
  selectedComponentId.value = componentId
}

function selectApp(appId: string) {
  selectedAppId.value = appId
  selectedComponentId.value = undefined
  components.value = []
  inspectors.value = []
  routerSnapshot.value = emptyRouterSnapshot
  clearTimelineEvents()
  void refreshData()
}

async function expandComponentTreeNode(componentId: string) {
  if (capabilities.value.pagedComponentTree) return componentTreeLoader.expand(componentId)
  const client = getRpcClient()
  if (!client || !selectedAppId.value) return
  const result = await client.command({
    type: 'components:expandTreeNode',
    appId: selectedAppId.value,
    payload: { componentId },
  })
  assertCommandSucceeded(result, 'Unable to expand component tree node')
}

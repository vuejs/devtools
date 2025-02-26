import type { DevToolsV6PluginAPIHookKeys, DevToolsV6PluginAPIHookPayloads, OpenInEditorOptions } from '@vue/devtools-kit'
import { devtools, DevToolsContextHookKeys, DevToolsMessagingHookKeys, devtoolsRouter, devtoolsRouterInfo, getActiveInspectors, getInspector, getInspectorActions, getInspectorInfo, getInspectorNodeActions, getRpcClient, getRpcServer, stringify, toggleClientConnected, updateDevToolsClientDetected, updateTimelineLayersState } from '@vue/devtools-kit'
import { createHooks } from 'hookable'

const hooks = createHooks()

export enum DevToolsMessagingEvents {
  INSPECTOR_TREE_UPDATED = 'inspector-tree-updated',
  INSPECTOR_STATE_UPDATED = 'inspector-state-updated',
  DEVTOOLS_STATE_UPDATED = 'devtools-state-updated',
  ROUTER_INFO_UPDATED = 'router-info-updated',
  TIMELINE_EVENT_UPDATED = 'timeline-event-updated',
  INSPECTOR_UPDATED = 'inspector-updated',
  ACTIVE_APP_UNMOUNTED = 'active-app-updated',
  DESTROY_DEVTOOLS_CLIENT = 'destroy-devtools-client',
  RELOAD_DEVTOOLS_CLIENT = 'reload-devtools-client',
}

function getDevToolsState() {
  const state = devtools.ctx.state
  return {
    connected: state.connected,
    clientConnected: true,
    vueVersion: state?.activeAppRecord?.version || '',
    tabs: state.tabs,
    commands: state.commands,
    vitePluginDetected: state.vitePluginDetected,
    appRecords: state.appRecords.map(item => ({
      id: item.id,
      name: item.name,
      version: item.version,
      routerId: item.routerId,
    })),
    activeAppRecordId: state.activeAppRecordId,
    timelineLayersState: state.timelineLayersState,
  }
}

export const functions = {
  on: (event: string, handler: Function) => {
    hooks.hook(event, handler)
  },
  off: (event: string, handler: Function) => {
    hooks.removeHook(event, handler)
  },
  once: (event: string, handler: Function) => {
    hooks.hookOnce(event, handler)
  },
  emit: (event: string, ...args: any[]) => {
    hooks.callHook(event, ...args)
  },
  heartbeat: () => {
    return true
  },
  devtoolsState: () => {
    return getDevToolsState()
  },
  async getInspectorTree(payload: Pick<DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE], 'inspectorId' | 'filter'>) {
    const res = await devtools.ctx.api.getInspectorTree(payload)
    return stringify(res) as string
  },
  async getInspectorState(payload: Pick<DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE], 'inspectorId' | 'nodeId'>) {
    const inspector = getInspector(payload.inspectorId)
    if (inspector)
      inspector.selectedNodeId = payload.nodeId

    const res = await devtools.ctx.api.getInspectorState(payload)
    return stringify(res) as string
  },
  async editInspectorState(payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]) {
    return await devtools.ctx.api.editInspectorState(payload)
  },
  sendInspectorState(id: string) {
    return devtools.ctx.api.sendInspectorState(id)
  },
  inspectComponentInspector() {
    return devtools.ctx.api.inspectComponentInspector()
  },
  cancelInspectComponentInspector() {
    return devtools.ctx.api.cancelInspectComponentInspector()
  },
  getComponentRenderCode(id: string) {
    return devtools.ctx.api.getComponentRenderCode(id)
  },
  scrollToComponent(id: string) {
    return devtools.ctx.api.scrollToComponent(id)
  },
  inspectDOM(id: string) {
    return devtools.ctx.api.inspectDOM(id)
  },
  getInspectorNodeActions(id: string) {
    return getInspectorNodeActions(id)
  },
  getInspectorActions(id: string) {
    return getInspectorActions(id)
  },
  updateTimelineLayersState(state: Record<string, boolean>) {
    return updateTimelineLayersState(state)
  },
  callInspectorNodeAction(inspectorId: string, actionIndex: number, nodeId: string) {
    const nodeActions = getInspectorNodeActions(inspectorId)
    if (nodeActions?.length) {
      const item = nodeActions[actionIndex]
      item.action?.(nodeId)
    }
  },
  callInspectorAction(inspectorId: string, actionIndex: number) {
    const actions = getInspectorActions(inspectorId)
    if (actions?.length) {
      const item = actions[actionIndex]
      item.action?.()
    }
  },
  openInEditor(options: OpenInEditorOptions) {
    return devtools.ctx.api.openInEditor(options)
  },
  async checkVueInspectorDetected() {
    return !!await devtools.ctx.api.getVueInspector()
  },
  async enableVueInspector() {
    const inspector = await devtools?.api?.getVueInspector?.()
    if (inspector)
      await inspector.enable()
  },
  async toggleApp(id: string, options?: { inspectingComponent?: boolean }) {
    return devtools.ctx.api.toggleApp(id, options)
  },
  updatePluginSettings(pluginId: string, key: string, value: string) {
    return devtools.ctx.api.updatePluginSettings(pluginId, key, value)
  },
  getPluginSettings(pluginId: string) {
    return devtools.ctx.api.getPluginSettings(pluginId)
  },
  getRouterInfo() {
    return devtoolsRouterInfo
  },
  navigate(path: string) {
    return devtoolsRouter.value?.push(path).catch(() => ({}))
  },
  getMatchedRoutes(path: string) {
    const c = console.warn
    console.warn = () => {}
    const matched = devtoolsRouter.value?.resolve?.({
      path: path || '/',
    }).matched ?? []
    console.warn = c
    return matched
  },
  toggleClientConnected(state: boolean) {
    toggleClientConnected(state)
  },
  getCustomInspector() {
    return getActiveInspectors()
  },
  getInspectorInfo(id: string) {
    return getInspectorInfo(id)
  },
  highlighComponent(uid: string) {
    return devtools.ctx.hooks.callHook(DevToolsContextHookKeys.COMPONENT_HIGHLIGHT, { uid })
  },
  unhighlight() {
    return devtools.ctx.hooks.callHook(DevToolsContextHookKeys.COMPONENT_UNHIGHLIGHT)
  },
  updateDevToolsClientDetected(params: Record<string, boolean>) {
    updateDevToolsClientDetected(params)
  },
  // listen to devtools server events
  initDevToolsServerListener() {
    const rpcServer = getRpcServer<RPCFunctions>()
    const broadcast = rpcServer.broadcast
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.SEND_INSPECTOR_TREE_TO_CLIENT, (payload) => {
      broadcast.emit(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, stringify(payload))
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.SEND_INSPECTOR_STATE_TO_CLIENT, (payload) => {
      broadcast.emit(DevToolsMessagingEvents.INSPECTOR_STATE_UPDATED, stringify(payload))
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.DEVTOOLS_STATE_UPDATED, () => {
      broadcast.emit(DevToolsMessagingEvents.DEVTOOLS_STATE_UPDATED, getDevToolsState())
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.ROUTER_INFO_UPDATED, ({ state }) => {
      broadcast.emit(DevToolsMessagingEvents.ROUTER_INFO_UPDATED, state)
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.SEND_TIMELINE_EVENT_TO_CLIENT, (payload) => {
      broadcast.emit(DevToolsMessagingEvents.TIMELINE_EVENT_UPDATED, stringify(payload))
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.SEND_INSPECTOR_TO_CLIENT, (payload) => {
      broadcast.emit(DevToolsMessagingEvents.INSPECTOR_UPDATED, payload)
    })
    devtools.ctx.hooks.hook(DevToolsMessagingHookKeys.SEND_ACTIVE_APP_UNMOUNTED_TO_CLIENT, () => {
      broadcast.emit(DevToolsMessagingEvents.ACTIVE_APP_UNMOUNTED)
    })
  },

}

export type RPCFunctions = typeof functions

export const rpc = new Proxy<{
  value: ReturnType<typeof getRpcClient<RPCFunctions>>
  functions: ReturnType<typeof getRpcClient<RPCFunctions>>
}>({
  value: {} as ReturnType<typeof getRpcClient<typeof functions>>,
  functions: {} as ReturnType<typeof getRpcClient<RPCFunctions>>,
}, {
  get(target, property) {
    const _rpc = getRpcClient<RPCFunctions>()
    if (property === 'value') {
      return _rpc
    }
    else if (property === 'functions') {
      return _rpc.$functions
    }
  },
})

export const rpcServer = new Proxy<{
  value: ReturnType<typeof getRpcServer<RPCFunctions>>
  functions: ReturnType<typeof getRpcServer<RPCFunctions>>
}>({
  value: {} as ReturnType<typeof getRpcServer<typeof functions>>,
  functions: {} as ReturnType<typeof getRpcServer<RPCFunctions>>,
}, {
  get(target, property) {
    const _rpc = getRpcServer<RPCFunctions>()
    if (property === 'value') {
      return _rpc
    }
    else if (property === 'functions') {
      return _rpc.functions
    }
  },
})

export function onRpcConnected(callback: () => void) {
  let timer: number = null!
  let retryCount = 0

  function heartbeat() {
    rpc.value?.heartbeat?.().then(() => {
      callback()
      clearTimeout(timer)
    }).catch(() => {
    })
  }

  timer = setInterval(() => {
    if (retryCount >= 30) {
      clearTimeout(timer)
    }
    retryCount++
    heartbeat()
  }, retryCount * 200 + 200) as unknown as number
  heartbeat()
}

export function onRpcSeverReady(callback: () => void) {
  let timer: number = null!
  const timeout = 120

  function heartbeat() {
    if (rpcServer.value.clients.length > 0) {
      callback()
      clearTimeout(timer)
    }
  }

  timer = setInterval(() => {
    heartbeat()
  }, timeout) as unknown as number
}

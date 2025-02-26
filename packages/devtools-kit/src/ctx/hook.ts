import type {
  App,
  ComponentInstance,
  ComponentTreeNode,
  CustomInspectorNode,
  CustomInspectorOptions,
  CustomInspectorState,
  DevToolsPlugin,
  EditStatePayload,
  InspectedComponentData,
  RouterInfo,
  TimelineEvent,
  TimelineEventOptions,
  TimelineLayerOptions,
} from '../types'
import { createHooks } from 'hookable'
import { debounce } from 'perfect-debounce'
import { highlight, unhighlight } from '../core/component-highlighter'
import { getComponentBoundingRect } from '../core/component/state/bounding-rect'
import { getInstanceName } from '../core/component/utils'
import { addInspector, getInspector } from './inspector'
import { activeAppRecord, DevToolsState, devtoolsState } from './state'
import { addTimelineLayer } from './timeline'

// v6 plugin api hooks
export enum DevToolsV6PluginAPIHookKeys {
  VISIT_COMPONENT_TREE = 'visitComponentTree',
  INSPECT_COMPONENT = 'inspectComponent',
  EDIT_COMPONENT_STATE = 'editComponentState',
  GET_INSPECTOR_TREE = 'getInspectorTree',
  GET_INSPECTOR_STATE = 'getInspectorState',
  EDIT_INSPECTOR_STATE = 'editInspectorState',
  INSPECT_TIMELINE_EVENT = 'inspectTimelineEvent',
  TIMELINE_CLEARED = 'timelineCleared',
  SET_PLUGIN_SETTINGS = 'setPluginSettings',
}

export interface DevToolsV6PluginAPIHookPayloads {
  [DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE]: {
    app: App
    componentInstance: ComponentInstance
    treeNode: ComponentTreeNode
    filter: string
  }
  [DevToolsV6PluginAPIHookKeys.INSPECT_COMPONENT]: {
    app: App
    componentInstance: ComponentInstance
    instanceData: InspectedComponentData
  }
  [DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE]: {
    app: App
    inspectorId: string
    nodeId: string
    path: string[]
    type: string
    state: EditStatePayload
    set: (object: any, path?: string | (string[]), value?: any, cb?: (object: any, field: string, value: any) => void) => void
  }
  [DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE]: {
    app: App
    inspectorId: string
    filter: string
    rootNodes: CustomInspectorNode[]
  }
  [DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE]: {
    app: App
    inspectorId: string
    nodeId: string
    state: CustomInspectorState
  }
  [DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]: {
    app: App
    inspectorId: string
    nodeId: string
    path: string[]
    type: string
    state: EditStatePayload
    set: (object: any, path?: string | (string[]), value?: any, cb?: (object: any, field: string, value: any) => void) => void
  }
  [DevToolsV6PluginAPIHookKeys.INSPECT_TIMELINE_EVENT]: {
    app: App
    layerId: string
    event: TimelineEvent
    all?: boolean
    data: any
  }
  [DevToolsV6PluginAPIHookKeys.TIMELINE_CLEARED]: Record<string, never>
  [DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS]: {
    app: App
    pluginId: string
    key: string
    newValue: any
    oldValue: any
    settings: any
  }
}

export interface DevToolsV6PluginAPIHooks {
  [DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE]) => void
  [DevToolsV6PluginAPIHookKeys.INSPECT_COMPONENT]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.INSPECT_COMPONENT]) => void
  [DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE]) => void
  [DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE]) => void
  [DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE]) => void
  [DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]) => void
  [DevToolsV6PluginAPIHookKeys.INSPECT_TIMELINE_EVENT]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.INSPECT_TIMELINE_EVENT]) => void
  [DevToolsV6PluginAPIHookKeys.TIMELINE_CLEARED]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.TIMELINE_CLEARED]) => void
  [DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS]: (payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS]) => void
}

// devtools context hooks
export enum DevToolsContextHookKeys {
  ADD_INSPECTOR = 'addInspector',
  SEND_INSPECTOR_TREE = 'sendInspectorTree',
  SEND_INSPECTOR_STATE = 'sendInspectorState',
  CUSTOM_INSPECTOR_SELECT_NODE = 'customInspectorSelectNode',
  TIMELINE_LAYER_ADDED = 'timelineLayerAdded',
  TIMELINE_EVENT_ADDED = 'timelineEventAdded',
  GET_COMPONENT_INSTANCES = 'getComponentInstances',
  GET_COMPONENT_BOUNDS = 'getComponentBounds',
  GET_COMPONENT_NAME = 'getComponentName',
  COMPONENT_HIGHLIGHT = 'componentHighlight',
  COMPONENT_UNHIGHLIGHT = 'componentUnhighlight',
}

export interface DevToolsContextHookPayloads {
  [DevToolsContextHookKeys.ADD_INSPECTOR]: {
    inspector: CustomInspectorOptions
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.SEND_INSPECTOR_TREE]: {
    inspectorId: string
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.SEND_INSPECTOR_STATE]: {
    inspectorId: string
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.CUSTOM_INSPECTOR_SELECT_NODE]: {
    inspectorId: string
    nodeId: string
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.TIMELINE_LAYER_ADDED]: {
    options: TimelineLayerOptions
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.TIMELINE_EVENT_ADDED]: {
    options: TimelineEventOptions
    plugin: DevToolsPlugin
  }
  [DevToolsContextHookKeys.GET_COMPONENT_INSTANCES]: {
    app: App
  }
  [DevToolsContextHookKeys.GET_COMPONENT_BOUNDS]: {
    instance: ComponentInstance
  }
  [DevToolsContextHookKeys.GET_COMPONENT_NAME]: {
    instance: ComponentInstance
  }
  [DevToolsContextHookKeys.COMPONENT_HIGHLIGHT]: {
    uid: string
  }
  [DevToolsContextHookKeys.COMPONENT_UNHIGHLIGHT]: Record<string, never>
}

// devtools client hooks
export enum DevToolsMessagingHookKeys {
  SEND_INSPECTOR_TREE_TO_CLIENT = 'sendInspectorTreeToClient',
  SEND_INSPECTOR_STATE_TO_CLIENT = 'sendInspectorStateToClient',
  SEND_TIMELINE_EVENT_TO_CLIENT = 'sendTimelineEventToClient',
  SEND_INSPECTOR_TO_CLIENT = 'sendInspectorToClient',
  SEND_ACTIVE_APP_UNMOUNTED_TO_CLIENT = 'sendActiveAppUpdatedToClient',
  DEVTOOLS_STATE_UPDATED = 'devtoolsStateUpdated',
  DEVTOOLS_CONNECTED_UPDATED = 'devtoolsConnectedUpdated',
  ROUTER_INFO_UPDATED = 'routerInfoUpdated',
}

export interface DevToolsMessagingHookPayloads {
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_TREE_TO_CLIENT]: {
    inspectorId: string
    rootNodes: CustomInspectorNode[]
  }
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_STATE_TO_CLIENT]: {
    inspectorId: string
    nodeId: string
    state: CustomInspectorState
  }
  [DevToolsMessagingHookKeys.SEND_TIMELINE_EVENT_TO_CLIENT]: TimelineEventOptions
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_TO_CLIENT]: {
    id: string
    label: string
    logo: string
    icon: string
    packageName: string | undefined
    homepage: string | undefined
  }[]
  [DevToolsMessagingHookKeys.DEVTOOLS_STATE_UPDATED]: {
    state: DevToolsState
  }
  [DevToolsMessagingHookKeys.DEVTOOLS_CONNECTED_UPDATED]: {
    state: DevToolsState
    oldState: DevToolsState
  }
  [DevToolsMessagingHookKeys.ROUTER_INFO_UPDATED]: {
    state: RouterInfo
  }
}

export interface DevToolsMessagingHooks {
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_TREE_TO_CLIENT]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.SEND_INSPECTOR_TREE_TO_CLIENT]) => void
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_STATE_TO_CLIENT]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.SEND_INSPECTOR_STATE_TO_CLIENT]) => void
  [DevToolsMessagingHookKeys.SEND_TIMELINE_EVENT_TO_CLIENT]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.SEND_TIMELINE_EVENT_TO_CLIENT]) => void
  [DevToolsMessagingHookKeys.SEND_ACTIVE_APP_UNMOUNTED_TO_CLIENT]: () => void
  [DevToolsMessagingHookKeys.SEND_INSPECTOR_TO_CLIENT]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.SEND_INSPECTOR_TO_CLIENT]) => void
  [DevToolsMessagingHookKeys.DEVTOOLS_STATE_UPDATED]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.DEVTOOLS_STATE_UPDATED]) => void
  [DevToolsMessagingHookKeys.DEVTOOLS_CONNECTED_UPDATED]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.DEVTOOLS_CONNECTED_UPDATED]) => void
  [DevToolsMessagingHookKeys.ROUTER_INFO_UPDATED]: (payload: DevToolsMessagingHookPayloads[DevToolsMessagingHookKeys.ROUTER_INFO_UPDATED]) => void
}

export interface DevToolsContextHooks extends DevToolsV6PluginAPIHooks {
  [DevToolsContextHookKeys.ADD_INSPECTOR]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.ADD_INSPECTOR]) => void
  [DevToolsContextHookKeys.SEND_INSPECTOR_TREE]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.SEND_INSPECTOR_TREE]) => void
  [DevToolsContextHookKeys.SEND_INSPECTOR_STATE]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.SEND_INSPECTOR_STATE]) => void
  [DevToolsContextHookKeys.CUSTOM_INSPECTOR_SELECT_NODE]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.CUSTOM_INSPECTOR_SELECT_NODE]) => void
  [DevToolsContextHookKeys.TIMELINE_LAYER_ADDED]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.TIMELINE_LAYER_ADDED]) => void
  [DevToolsContextHookKeys.TIMELINE_EVENT_ADDED]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.TIMELINE_EVENT_ADDED]) => void
  [DevToolsContextHookKeys.GET_COMPONENT_INSTANCES]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.GET_COMPONENT_INSTANCES]) => void
  [DevToolsContextHookKeys.GET_COMPONENT_BOUNDS]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.GET_COMPONENT_BOUNDS]) => void
  [DevToolsContextHookKeys.GET_COMPONENT_NAME]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.GET_COMPONENT_NAME]) => void
  [DevToolsContextHookKeys.COMPONENT_HIGHLIGHT]: (payload: DevToolsContextHookPayloads[DevToolsContextHookKeys.COMPONENT_HIGHLIGHT]) => void
  [DevToolsContextHookKeys.COMPONENT_UNHIGHLIGHT]: () => void
}

export function createDevToolsCtxHooks() {
  const hooks = createHooks<DevToolsContextHooks & DevToolsMessagingHooks>()
  hooks.hook(DevToolsContextHookKeys.ADD_INSPECTOR, ({ inspector, plugin }) => {
    addInspector(inspector, plugin.descriptor)
  })

  const debounceSendInspectorTree = debounce(async ({ inspectorId, plugin }) => {
    if (!inspectorId || !plugin?.descriptor?.app || devtoolsState.highPerfModeEnabled)
      return

    // 1. get inspector
    const inspector = getInspector(inspectorId, plugin.descriptor.app)

    // 2. get inspector tree
    const _payload = {
      app: plugin.descriptor.app,
      inspectorId,
      filter: inspector?.treeFilter || '',
      rootNodes: [],
    }

    await new Promise<void>((resolve) => {
      // @ts-expect-error hookable
      hooks.callHookWith(async (callbacks) => {
        await Promise.all(callbacks.map(cb => cb(_payload)))
        resolve()
      }, DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE)
    })

    // @ts-expect-error hookable
    hooks.callHookWith(async (callbacks) => {
      await Promise.all(callbacks.map(cb => cb({
        inspectorId,
        rootNodes: _payload.rootNodes,
      })))
    }, DevToolsMessagingHookKeys.SEND_INSPECTOR_TREE_TO_CLIENT)
  }, 120)

  // send inspector tree
  hooks.hook(DevToolsContextHookKeys.SEND_INSPECTOR_TREE, debounceSendInspectorTree)

  const debounceSendInspectorState = debounce(async ({ inspectorId, plugin }) => {
    if (!inspectorId || !plugin?.descriptor?.app || devtoolsState.highPerfModeEnabled)
      return

    // 1. get inspector
    const inspector = getInspector(inspectorId, plugin.descriptor.app)
    // 2. get inspector state
    const _payload = {
      app: plugin.descriptor.app,
      inspectorId,
      nodeId: inspector?.selectedNodeId || '',
      state: null,
    }

    const ctx = {
      currentTab: `custom-inspector:${inspectorId}`,
    }

    if (_payload.nodeId) {
      await new Promise<void>((resolve) => {
        // @ts-expect-error hookable
        hooks.callHookWith(async (callbacks) => {
          await Promise.all(callbacks.map(cb => cb(_payload, ctx)))
          resolve()
        }, DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE)
      })
    }

    // @ts-expect-error hookable
    hooks.callHookWith(async (callbacks) => {
      await Promise.all(callbacks.map(cb => cb({
        inspectorId,
        nodeId: _payload.nodeId,
        state: _payload.state,
      })))
    }, DevToolsMessagingHookKeys.SEND_INSPECTOR_STATE_TO_CLIENT)
  }, 120)

  // send inspector state
  hooks.hook(DevToolsContextHookKeys.SEND_INSPECTOR_STATE, debounceSendInspectorState)

  // select inspector node
  hooks.hook(DevToolsContextHookKeys.CUSTOM_INSPECTOR_SELECT_NODE, ({ inspectorId, nodeId, plugin }) => {
    // 1. get inspector
    const inspector = getInspector(inspectorId, plugin.descriptor.app)

    if (!inspector)
      return

    // 2. select node
    inspector.selectedNodeId = nodeId

    // 3. select node in devtools client and fetch state
  })

  // add timeline layer
  hooks.hook(DevToolsContextHookKeys.TIMELINE_LAYER_ADDED, ({ options, plugin }) => {
    // 1. update layers
    addTimelineLayer(options, plugin.descriptor)
  })

  // add timeline event
  hooks.hook(DevToolsContextHookKeys.TIMELINE_EVENT_ADDED, ({ options, plugin }) => {
    const internalLayerIds = ['performance', 'component-event', 'keyboard', 'mouse']
    if (devtoolsState.highPerfModeEnabled || (!devtoolsState.timelineLayersState?.[plugin.descriptor.id] && !internalLayerIds.includes(options.layerId)))
      return
    // @ts-expect-error hookable
    hooks.callHookWith(async (callbacks) => {
      await Promise.all(callbacks.map(cb => cb(options)))
    }, DevToolsMessagingHookKeys.SEND_TIMELINE_EVENT_TO_CLIENT)
  })

  // get component instances
  hooks.hook(DevToolsContextHookKeys.GET_COMPONENT_INSTANCES, async ({ app }) => {
    const appRecord = app.__VUE_DEVTOOLS_NEXT_APP_RECORD__
    if (!appRecord)
      return null
    const appId = appRecord.id.toString()
    const instances = [...appRecord.instanceMap]
      .filter(([key]) => key.split(':')[0] === appId)
      .map(([,instance]) => instance)
    return instances
  })

  // get component bounds
  hooks.hook(DevToolsContextHookKeys.GET_COMPONENT_BOUNDS, async ({ instance }) => {
    const bounds = getComponentBoundingRect(instance)
    return bounds
  })

  // get component name
  hooks.hook(DevToolsContextHookKeys.GET_COMPONENT_NAME, ({ instance }) => {
    const name = getInstanceName(instance)
    return name
  })

  // component highlight
  hooks.hook(DevToolsContextHookKeys.COMPONENT_HIGHLIGHT, ({ uid }) => {
    // 1. highlight component in devtools client
    const instance = activeAppRecord.value.instanceMap.get(uid)
    if (instance) {
      highlight(instance)
    }
  })

  // component unhighlight
  hooks.hook(DevToolsContextHookKeys.COMPONENT_UNHIGHLIGHT, () => {
    unhighlight()
  })

  return hooks
}

import type { Hookable, HookKeys } from 'hookable'
import type { CustomInspectorState } from '../types'
import type { DevToolsContextHooks, DevToolsMessagingHooks, DevToolsV6PluginAPIHookPayloads } from './hook'
import { target } from '@vue/devtools-shared'
import { cancelInspectComponentHighLighter, inspectComponentHighLighter, scrollToComponent } from '../core/component-highlighter'
import { getComponentInspector } from '../core/component-inspector'
import { StateEditor } from '../core/component/state/editor'
import { getRootElementsFromComponentInstance } from '../core/component/tree/el'
import { getComponentInstance } from '../core/component/utils'
import { openInEditor } from '../core/open-in-editor'
import { registerDevToolsPlugin } from '../core/plugin'
import { getPluginSettings, getPluginSettingsOptions, setPluginSettings } from '../core/plugin/plugin-settings'
import { normalizeRouterInfo } from '../core/router'
import { DevToolsContextHookKeys, DevToolsV6PluginAPIHookKeys } from './hook'
import { callInspectorUpdatedHook, getInspector } from './inspector'
import { activeAppRecord, devtoolsAppRecords, setActiveAppRecord, setActiveAppRecordId } from './state'

export function createDevToolsApi(hooks: Hookable<DevToolsContextHooks & DevToolsMessagingHooks, HookKeys<DevToolsContextHooks & DevToolsMessagingHooks>>) {
  return {
    // get inspector tree
    async getInspectorTree(payload: Pick<DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE], 'inspectorId' | 'filter'>) {
      const _payload = {
        ...payload,
        app: activeAppRecord.value.app,
        rootNodes: [],
      }
      await new Promise<void>((resolve) => {
        // @ts-expect-error hookable
        hooks.callHookWith(async (callbacks) => {
          await Promise.all(callbacks.map(cb => cb(_payload)))
          resolve()
        }, DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE)
      })
      return _payload.rootNodes
    },
    // get inspector state
    async getInspectorState(payload: Pick<DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE], 'inspectorId' | 'nodeId'>) {
      const _payload = {
        ...payload,
        app: activeAppRecord.value.app,
        state: null as CustomInspectorState | null,
      }

      const ctx = {
        currentTab: `custom-inspector:${payload.inspectorId}`,
      }

      await new Promise<void>((resolve) => {
        // @ts-expect-error hookable
        hooks.callHookWith(async (callbacks) => {
          await Promise.all(callbacks.map(cb => cb(_payload, ctx)))
          resolve()
        }, DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE)
      })
      return _payload.state!
    },
    // edit inspector state
    editInspectorState(payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]) {
      const stateEditor = new StateEditor()
      const _payload = {
        ...payload,
        app: activeAppRecord.value.app,
        set: (obj, path = payload.path, value = payload.state.value, cb) => {
          stateEditor.set(obj, path, value, cb || stateEditor.createDefaultSetCallback(payload.state))
        },
      }

      // @ts-expect-error hookable
      hooks.callHookWith((callbacks) => {
        callbacks.forEach(cb => cb(_payload))
      }, DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE)
    },
    // send inspector state
    sendInspectorState(inspectorId: string) {
      const inspector = getInspector(inspectorId)
      hooks.callHook(DevToolsContextHookKeys.SEND_INSPECTOR_STATE, { inspectorId, plugin: {
        descriptor: inspector!.descriptor,
        setupFn: () => ({}),
      } })
    },
    // inspect component inspector
    inspectComponentInspector() {
      return inspectComponentHighLighter()
    },
    // cancel inspect component inspector
    cancelInspectComponentInspector() {
      return cancelInspectComponentHighLighter()
    },
    // get component render code
    getComponentRenderCode(id: string) {
      const instance = getComponentInstance(activeAppRecord.value, id)

      if (instance)
        return !(instance?.type instanceof Function) ? instance.render.toString() : instance.type.toString()
    },
    // scroll to component
    scrollToComponent(id: string) {
      return scrollToComponent({ id })
    },
    // open in editor
    openInEditor,
    // get vue inspector
    getVueInspector: getComponentInspector,
    // toggle app
    toggleApp(id: string, options?: { inspectingComponent?: boolean }) {
      const appRecord = devtoolsAppRecords.value.find(record => record.id === id)

      if (appRecord) {
        setActiveAppRecordId(id)
        setActiveAppRecord(appRecord)
        normalizeRouterInfo(appRecord, activeAppRecord)
        callInspectorUpdatedHook()
        registerDevToolsPlugin(appRecord.app, options)
      }
    },
    // inspect dom
    inspectDOM(instanceId: string) {
      const instance = getComponentInstance(activeAppRecord.value, instanceId)
      if (instance) {
        const [el] = getRootElementsFromComponentInstance(instance)
        if (el) {
          target.__VUE_DEVTOOLS_INSPECT_DOM_TARGET__ = el
        }
      }
    },
    updatePluginSettings(pluginId: string, key: string, value: string) {
      setPluginSettings(pluginId, key, value)
    },
    getPluginSettings(pluginId: string) {
      return {
        options: getPluginSettingsOptions(pluginId),
        values: getPluginSettings(pluginId),
      }
    },
  }
}

export type DevToolsApiType = ReturnType<typeof createDevToolsApi>

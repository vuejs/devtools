import type { DevtoolsContext } from '../../ctx'
import type { App, ComponentBounds, ComponentInstance, CustomInspectorOptions, DevToolsPlugin, TimelineEventOptions, TimelineLayerOptions } from '../../types'
import { getPluginSettings, initPluginSettings } from '../../core/plugin/plugin-settings'

import { devtoolsState } from '../../ctx'
import { DevToolsContextHookKeys, DevToolsV6PluginAPIHookKeys, DevToolsV6PluginAPIHookPayloads, DevToolsV6PluginAPIHooks } from '../../ctx/hook'
import { getActiveInspectors } from '../../ctx/inspector'
import { devtoolsHooks } from '../../hook'
import { DevToolsHooks } from '../../types'

export class DevToolsV6PluginAPI {
  private plugin: DevToolsPlugin
  private hooks: DevtoolsContext['hooks']
  constructor({ plugin, ctx }: { plugin: DevToolsPlugin, ctx: DevtoolsContext }) {
    this.hooks = ctx.hooks
    this.plugin = plugin
  }

  public get on() {
    return {
      // component inspector
      visitComponentTree: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE, handler)
      },
      inspectComponent: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.INSPECT_COMPONENT]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.INSPECT_COMPONENT, handler)
      },
      editComponentState: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.EDIT_COMPONENT_STATE, handler)
      },

      // custom inspector
      getInspectorTree: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_TREE, handler)
      },
      getInspectorState: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.GET_INSPECTOR_STATE, handler)
      },
      editInspectorState: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.EDIT_INSPECTOR_STATE, handler)
      },

      // timeline
      inspectTimelineEvent: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.INSPECT_TIMELINE_EVENT]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.INSPECT_TIMELINE_EVENT, handler)
      },
      timelineCleared: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.TIMELINE_CLEARED]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.TIMELINE_CLEARED, handler)
      },

      // settings
      setPluginSettings: (handler: DevToolsV6PluginAPIHooks[DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS]) => {
        this.hooks.hook(DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS, handler)
      },
    }
  }

  // component inspector
  notifyComponentUpdate(instance?: ComponentInstance) {
    if (devtoolsState.highPerfModeEnabled) {
      return
    }
    const inspector = getActiveInspectors().find(i => i.packageName === this.plugin.descriptor.packageName)
    if (inspector?.id) {
      // @TODO: handler
      if (instance) {
        const args = [
          instance.appContext.app,
          instance.uid,
          instance.parent?.uid,
          instance,
        ] as const
        devtoolsHooks.callHook(DevToolsHooks.COMPONENT_UPDATED, ...args)
      }
      else {
        // @ts-expect-error skip type check
        devtoolsHooks.callHook(DevToolsHooks.COMPONENT_UPDATED)
      }
      this.hooks.callHook(DevToolsContextHookKeys.SEND_INSPECTOR_STATE, { inspectorId: inspector.id, plugin: this.plugin })
    }
  }

  // custom inspector
  addInspector(options: CustomInspectorOptions) {
    this.hooks.callHook(DevToolsContextHookKeys.ADD_INSPECTOR, { inspector: options, plugin: this.plugin })
    if (this.plugin.descriptor.settings) {
      initPluginSettings(options.id, this.plugin.descriptor.settings)
    }
  }

  sendInspectorTree(inspectorId: string) {
    if (devtoolsState.highPerfModeEnabled) {
      return
    }
    this.hooks.callHook(DevToolsContextHookKeys.SEND_INSPECTOR_TREE, { inspectorId, plugin: this.plugin })
  }

  sendInspectorState(inspectorId: string) {
    if (devtoolsState.highPerfModeEnabled) {
      return
    }
    this.hooks.callHook(DevToolsContextHookKeys.SEND_INSPECTOR_STATE, { inspectorId, plugin: this.plugin })
  }

  selectInspectorNode(inspectorId: string, nodeId: string) {
    this.hooks.callHook(DevToolsContextHookKeys.CUSTOM_INSPECTOR_SELECT_NODE, { inspectorId, nodeId, plugin: this.plugin })
  }

  visitComponentTree(payload: DevToolsV6PluginAPIHookPayloads[DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE]) {
    return this.hooks.callHook(DevToolsV6PluginAPIHookKeys.VISIT_COMPONENT_TREE, payload)
  }

  // timeline
  now(): number {
    if (devtoolsState.highPerfModeEnabled) {
      return 0
    }
    return Date.now()
  }

  addTimelineLayer(options: TimelineLayerOptions) {
    this.hooks.callHook(DevToolsContextHookKeys.TIMELINE_LAYER_ADDED, { options, plugin: this.plugin })
  }

  addTimelineEvent(options: TimelineEventOptions) {
    if (devtoolsState.highPerfModeEnabled) {
      return
    }
    this.hooks.callHook(DevToolsContextHookKeys.TIMELINE_EVENT_ADDED, { options, plugin: this.plugin })
  }

  // settings
  getSettings(pluginId?: string) {
    return getPluginSettings((pluginId ?? this.plugin.descriptor.id)!, this.plugin.descriptor.settings)
  }

  // utilities
  getComponentInstances(app: App): Promise<ComponentInstance[]> {
    return this.hooks.callHook(DevToolsContextHookKeys.GET_COMPONENT_INSTANCES, { app })
  }

  getComponentBounds(instance: ComponentInstance): Promise<ComponentBounds> {
    return this.hooks.callHook(DevToolsContextHookKeys.GET_COMPONENT_BOUNDS, { instance })
  }

  getComponentName(instance: ComponentInstance): Promise<string> {
    return this.hooks.callHook(DevToolsContextHookKeys.GET_COMPONENT_NAME, { instance })
  }

  highlightElement(instance: ComponentInstance) {
    const uid = instance.__VUE_DEVTOOLS_NEXT_UID__
    return this.hooks.callHook(DevToolsContextHookKeys.COMPONENT_HIGHLIGHT, { uid })
  }

  unhighlightElement() {
    return this.hooks.callHook(DevToolsContextHookKeys.COMPONENT_UNHIGHLIGHT)
  }
}

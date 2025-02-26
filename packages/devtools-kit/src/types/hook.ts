import type { App } from 'vue'
import type { AppRecord, VueAppInstance } from './app'
import type { PluginDescriptor, PluginSetupFunction } from './plugin'

type HookAppInstance = App & VueAppInstance
export enum DevToolsHooks {
  // internal
  APP_INIT = 'app:init',
  APP_UNMOUNT = 'app:unmount',
  COMPONENT_UPDATED = 'component:updated',
  COMPONENT_ADDED = 'component:added',
  COMPONENT_REMOVED = 'component:removed',
  COMPONENT_EMIT = 'component:emit',
  PERFORMANCE_START = 'perf:start',
  PERFORMANCE_END = 'perf:end',
  ADD_ROUTE = 'router:add-route',
  REMOVE_ROUTE = 'router:remove-route',
  RENDER_TRACKED = 'render:tracked',
  RENDER_TRIGGERED = 'render:triggered',
  APP_CONNECTED = 'app:connected',
  SETUP_DEVTOOLS_PLUGIN = 'devtools-plugin:setup',
}

export interface DevToolsEvent {
  [DevToolsHooks.APP_INIT]: (app: VueAppInstance['appContext']['app'], version: string, types: Record<string, string | symbol>) => void | Promise<void>
  [DevToolsHooks.APP_CONNECTED]: () => void
  [DevToolsHooks.APP_UNMOUNT]: (app: VueAppInstance['appContext']['app']) => void | Promise<void>
  [DevToolsHooks.COMPONENT_ADDED]: (app: HookAppInstance, uid: number, parentUid: number, component: VueAppInstance) => void | Promise<void>
  [DevToolsHooks.COMPONENT_EMIT]: (app: HookAppInstance, instance: VueAppInstance, event: string, params: unknown) => void | Promise<void>
  [DevToolsHooks.COMPONENT_UPDATED]: DevToolsEvent['component:added']
  [DevToolsHooks.COMPONENT_REMOVED]: DevToolsEvent['component:added']
  [DevToolsHooks.SETUP_DEVTOOLS_PLUGIN]: (pluginDescriptor: PluginDescriptor, setupFn: PluginSetupFunction, options?: { target?: string }) => void
  [DevToolsHooks.PERFORMANCE_START]: (app: App, uid: number, vm: HookAppInstance, type: string, time: number) => void
  [DevToolsHooks.PERFORMANCE_END]: (app: App, uid: number, vm: HookAppInstance, type: string, time: number) => void
}

export interface DevToolsHook {
  id: string
  enabled?: boolean
  devtoolsVersion: string
  events: Map<DevToolsHooks, Function[]>
  emit: (event: DevToolsHooks, ...payload: any[]) => void
  on: <T extends Function>(event: DevToolsHooks, handler: T) => () => void
  once: <T extends Function>(event: DevToolsHooks, handler: T) => void
  off: <T extends Function>(event: DevToolsHooks, handler: T) => void
  appRecords: AppRecord[]
  apps: any
  cleanupBuffer?: (matchArg: unknown) => boolean
}

export interface VueHooks {
  on: {
    vueAppInit: (fn: DevToolsEvent[DevToolsHooks.APP_INIT]) => void
    vueAppUnmount: (fn: DevToolsEvent[DevToolsHooks.APP_UNMOUNT]) => void
    vueAppConnected: (fn: DevToolsEvent[DevToolsHooks.APP_CONNECTED]) => void
    componentAdded: (fn: DevToolsEvent[DevToolsHooks.COMPONENT_ADDED]) => () => void
    componentEmit: (fn: DevToolsEvent[DevToolsHooks.COMPONENT_EMIT]) => () => void
    componentUpdated: (fn: DevToolsEvent[DevToolsHooks.COMPONENT_UPDATED]) => () => void
    componentRemoved: (fn: DevToolsEvent[DevToolsHooks.COMPONENT_REMOVED]) => () => void
    setupDevtoolsPlugin: (fn: DevToolsEvent[DevToolsHooks.SETUP_DEVTOOLS_PLUGIN]) => void
    perfStart: (fn: DevToolsEvent[DevToolsHooks.PERFORMANCE_START]) => void
    perfEnd: (fn: DevToolsEvent[DevToolsHooks.PERFORMANCE_END]) => void
  }
  setupDevToolsPlugin: (pluginDescriptor: PluginDescriptor, setupFn: PluginSetupFunction) => void
}

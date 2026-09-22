import type { AppRef, InstanceRef, VueTypeMap } from '../runtime'

export const enum DevtoolsHookEvent {
  APP_INIT = 'app:init',
  APP_UNMOUNT = 'app:unmount',
  COMPONENT_ADDED = 'component:added',
  COMPONENT_UPDATED = 'component:updated',
  COMPONENT_REMOVED = 'component:removed',
  COMPONENT_EMIT = 'component:emit',
  PERFORMANCE_START = 'perf:start',
  PERFORMANCE_END = 'perf:end',
  SETUP_DEVTOOLS_PLUGIN = 'devtools-plugin:setup',
}

export interface DevtoolsGlobalHook {
  id: string
  devtoolsVersion: string
  enabled: boolean
  apps: AppRef[]
  events: Map<string, Set<Function>>
  cleanupBuffer(component: InstanceRef): boolean
  on<T extends Function>(event: string, handler: T): () => void
  once<T extends Function>(event: string, handler: T): void
  off<T extends Function>(event: string, handler: T): void
  emit(event: string, ...payload: unknown[]): void
}

export interface DevtoolsHookableBridge {
  hook<T extends Function>(event: string, handler: T): () => void
  callHook(event: string, ...payload: unknown[]): Promise<void>
}

export interface DevtoolsHookTarget {
  __VUE_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsGlobalHook
  __VUE_DEVTOOLS_HOOK?: DevtoolsHookableBridge
  __VUE_DEVTOOLS_HOOK__?: DevtoolsHookableBridge
  __VUE_DEVTOOLS_HOOK_REPLAY__?: Array<(hook: DevtoolsGlobalHook) => void>
}

export type HookApp = AppRef & {
  _instance?: InstanceRef
  _container?: {
    _vnode?: {
      component?: InstanceRef
    }
  }
}

export type HookComponentPayload = [
  app: HookApp,
  uid: number,
  parentUid: number,
  component: InstanceRef,
]
export type HookAppInitPayload = [app: HookApp, version: string, types: VueTypeMap]
export type HookAppUnmountPayload = [app: HookApp]

import type { DevToolsApiType } from './api'
import type { DevToolsContextHooks, DevToolsMessagingHooks } from './hook'
import type { DevToolsAppRecords, DevToolsState } from './state'
import { target } from '@vue/devtools-shared'
import { Hookable, HookKeys } from 'hookable'
import { createDevToolsApi } from './api'
import { createDevToolsCtxHooks } from './hook'
import { activeAppRecord, devtoolsAppRecords, devtoolsState } from './state'

export * from './api'
export * from './env'
export * from './hook'
export * from './inspector'
export * from './plugin'
export * from './router'
export * from './state'
export { updateTimelineLayersState } from './timeline'

export interface DevtoolsContext {
  hooks: Hookable<DevToolsContextHooks & DevToolsMessagingHooks, HookKeys<DevToolsContextHooks & DevToolsMessagingHooks>>
  state: DevToolsState & {
    activeAppRecordId: string
    activeAppRecord: DevToolsAppRecords
    appRecords: DevToolsAppRecords[]
  }
  api: DevToolsApiType
}

const hooks = createDevToolsCtxHooks()

target.__VUE_DEVTOOLS_KIT_CONTEXT__ ??= {
  hooks,
  get state() {
    return {
      ...devtoolsState,
      activeAppRecordId: activeAppRecord.id,
      activeAppRecord: activeAppRecord.value,
      appRecords: devtoolsAppRecords.value,
    }
  },
  api: createDevToolsApi(hooks),
}

export const devtoolsContext = target.__VUE_DEVTOOLS_KIT_CONTEXT__ as DevtoolsContext

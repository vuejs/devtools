import { initDevTools, onDevToolsClientConnected } from './core'
import { toggleComponentInspectorEnabled } from './core/component-inspector'
import { toggleHighPerfMode } from './core/high-perf-mode'
import { setOpenInEditorBaseUrl } from './core/open-in-editor'
import { setupDevToolsPlugin } from './core/plugin'
import { addCustomCommand, addCustomTab, devtoolsContext, removeCustomCommand } from './ctx'
import { hook } from './hook'

export * from './core'
export type * from './core/component-highlighter'
export type * from './core/component-inspector'
export { INFINITY, NAN, NEGATIVE_INFINITY, UNDEFINED } from './core/component/state/constants'
export { formatInspectorStateValue, getInspectorStateValueType, getRaw, toEdit, toSubmit } from './core/component/state/format'
export { isPlainObject } from './core/component/state/is'
export { escape } from './core/component/state/util'
export type * from './core/component/types'
export { updateDevToolsClientDetected } from './core/devtools-client/detected'
export type * from './core/open-in-editor'
export * from './core/plugin'
export * from './ctx'
export * from './messaging'
export { parse, stringify } from './shared'
export type * from './types'

export const devtools = {
  hook,
  init: () => {
    initDevTools()
  },
  get ctx() {
    return devtoolsContext
  },
  get api() {
    return devtoolsContext.api
  },
}

export {
  addCustomCommand,
  addCustomTab,
  onDevToolsClientConnected,
  removeCustomCommand,
  setOpenInEditorBaseUrl,
  setupDevToolsPlugin,
  toggleComponentInspectorEnabled,
  toggleHighPerfMode,
}

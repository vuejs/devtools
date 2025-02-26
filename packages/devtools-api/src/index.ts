export {
  addCustomCommand,
  addCustomTab,
  onDevToolsClientConnected,
  onDevToolsConnected,
  removeCustomCommand,
  setupDevToolsPlugin,
  // compatible with v6.x
  setupDevToolsPlugin as setupDevtoolsPlugin,
} from '@vue/devtools-kit'

export type {
  CustomCommand,
  CustomTab,
} from '@vue/devtools-kit'

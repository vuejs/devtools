import { connect } from '@vue/devtools-electron'
import { devtools as _devtools, addCustomCommand, addCustomTab, onDevToolsClientConnected, onDevToolsConnected, removeCustomCommand } from '@vue/devtools-kit'

export type * from '@vue/devtools-kit'

const devtools = {
  ..._devtools,
  connect,
}

export {
  addCustomCommand,
  addCustomTab,
  devtools,
  onDevToolsClientConnected,
  onDevToolsConnected,
  removeCustomCommand,
}

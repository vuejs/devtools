import type { PluginDescriptor, PluginSetupFunction } from '@vue/devtools-kit'

export function setupDevToolsPlugin(
  _pluginDescriptor: PluginDescriptor,
  _setupFn: PluginSetupFunction,
): void {}

export { setupDevToolsPlugin as setupDevtoolsPlugin }

export function onDevToolsConnected(_callback: () => void): Promise<void> {
  return new Promise<void>(() => {})
}

export function onDevToolsClientConnected(_callback: () => void): Promise<void> {
  return new Promise<void>(() => {})
}

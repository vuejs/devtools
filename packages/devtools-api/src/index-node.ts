import type { PluginDescriptor, PluginSetupFunction } from '@vue/devtools-kit'

export function addCustomCommand(): void {}
export function addCustomTab(): void {}
export function onDevToolsClientConnected(_fn: () => void): Promise<void> {
  return new Promise<void>(() => {})
}
export function onDevToolsConnected(_fn: () => void): Promise<void> {
  return new Promise<void>(() => {})
}
export function removeCustomCommand(): void {}
export function setupDevToolsPlugin(_pluginDescriptor: PluginDescriptor, _setupFn: PluginSetupFunction): void {}

export { setupDevToolsPlugin as setupDevtoolsPlugin }

export type {
  CustomCommand,
  CustomTab,
} from '@vue/devtools-kit'

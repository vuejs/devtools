import { target } from '@vue/devtools-shared'
import { DevToolsPluginAPI } from '../../api'
import { devtoolsContext, devtoolsPluginBuffer } from '../../ctx'
import { devtoolsState } from '../../ctx/state'
import { hook } from '../../hook'
import { App, PluginDescriptor, PluginSetupFunction } from '../../types'

export * from './components'

target.__VUE_DEVTOOLS_KIT__REGISTERED_PLUGIN_APPS__ ??= new Set<App>()

export function setupDevToolsPlugin(pluginDescriptor: PluginDescriptor, setupFn: PluginSetupFunction) {
  return hook.setupDevToolsPlugin(pluginDescriptor, setupFn)
}

export function callDevToolsPluginSetupFn(plugin: [PluginDescriptor, PluginSetupFunction], app: App) {
  const [pluginDescriptor, setupFn] = plugin
  if (pluginDescriptor.app !== app)
    return

  const api = new DevToolsPluginAPI({
    plugin: {
      setupFn,
      descriptor: pluginDescriptor,
    },
    ctx: devtoolsContext,
  })

  // patch for vuex devtools
  if (pluginDescriptor.packageName === 'vuex') {
    api.on.editInspectorState((payload) => {
      api.sendInspectorState(payload.inspectorId)
    })
  }

  setupFn(api)
}

export function removeRegisteredPluginApp(app: App) {
  target.__VUE_DEVTOOLS_KIT__REGISTERED_PLUGIN_APPS__.delete(app)
}

export function registerDevToolsPlugin(app: App, options?: { inspectingComponent?: boolean }) {
  if (target.__VUE_DEVTOOLS_KIT__REGISTERED_PLUGIN_APPS__.has(app)) {
    return
  }
  if (devtoolsState.highPerfModeEnabled && !options?.inspectingComponent) {
    return
  }

  target.__VUE_DEVTOOLS_KIT__REGISTERED_PLUGIN_APPS__.add(app)

  devtoolsPluginBuffer.forEach((plugin) => {
    callDevToolsPluginSetupFn(plugin, app)
  })
}

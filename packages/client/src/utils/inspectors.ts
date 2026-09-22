import type { CustomInspectorSnapshot, PluginSnapshot } from '../composables/devtools-client'
import { builtinTabs } from '../constants/tabs'

const internalCustomInspectorIds = new Set<string>(builtinTabs.map((tab) => tab.id))

export function findRouterInspector(
  inspectors: CustomInspectorSnapshot[],
  plugins: PluginSnapshot[],
): CustomInspectorSnapshot | undefined {
  const routerPlugin = plugins.find((plugin) => plugin.packageName === 'vue-router')

  return (
    inspectors.find(
      (inspector) => isRouterInspectorId(inspector.id) && inspector.pluginId === routerPlugin?.id,
    ) ?? inspectors.find((inspector) => isRouterInspectorId(inspector.id))
  )
}

export function isRouterInspectorId(inspectorId: string): boolean {
  return inspectorId.startsWith('router-inspector')
}

export function isInternalCustomInspector(inspector: Pick<CustomInspectorSnapshot, 'id'>): boolean {
  return internalCustomInspectorIds.has(inspector.id)
}

export function isInternalDevtoolsPlugin(
  plugin: PluginSnapshot,
  inspectors: CustomInspectorSnapshot[],
): boolean {
  if (
    internalCustomInspectorIds.has(plugin.id) ||
    (plugin.packageName != null && internalCustomInspectorIds.has(plugin.packageName))
  ) {
    return true
  }

  return inspectors.some(
    (inspector) => inspector.pluginId === plugin.id && isInternalCustomInspector(inspector),
  )
}

export function getPluginTitle(pluginId: string | undefined, plugins: PluginSnapshot[]): string {
  const plugin = plugins.find((item) => item.id === pluginId)
  return plugin?.label || plugin?.packageName || pluginId || 'unknown plugin'
}

import { devtoolsContext, DevToolsV6PluginAPIHookKeys } from '../../ctx'
import { devtoolsPluginBuffer } from '../../ctx/plugin'
import { PluginDescriptor } from '../../types'

function _getSettings(settings: PluginDescriptor['settings']) {
  const _settings = {}
  Object.keys(settings!).forEach((key) => {
    _settings[key] = settings![key].defaultValue
  })

  return _settings
}

function getPluginLocalKey(pluginId: string) {
  return `__VUE_DEVTOOLS_NEXT_PLUGIN_SETTINGS__${pluginId}__`
}

export function getPluginSettingsOptions(pluginId: string) {
  const item = devtoolsPluginBuffer.find(item => item[0].id === pluginId && !!(item[0]?.settings))?.[0] ?? null
  return item?.settings ?? null
}

export function getPluginSettings(pluginId: string, fallbackValue?: PluginDescriptor['settings']) {
  const localKey = getPluginLocalKey(pluginId)
  if (localKey) {
    const localSettings = localStorage.getItem(localKey)
    if (localSettings) {
      return JSON.parse(localSettings)
    }
  }

  if (pluginId) {
    const item = devtoolsPluginBuffer.find(item => item[0].id === pluginId)?.[0] ?? null
    return _getSettings(item?.settings ?? {})
  }
  return _getSettings(fallbackValue)
}

export function initPluginSettings(pluginId: string, settings: PluginDescriptor['settings']) {
  const localKey = getPluginLocalKey(pluginId)
  const localSettings = localStorage.getItem(localKey)
  if (!localSettings) {
    localStorage.setItem(localKey, JSON.stringify(_getSettings(settings)))
  }
}

export function setPluginSettings(pluginId: string, key: string, value: string) {
  const localKey = getPluginLocalKey(pluginId)
  const localSettings = localStorage.getItem(localKey)!
  const parsedLocalSettings = JSON.parse(localSettings || '{}')
  const updated = {
    ...parsedLocalSettings,
    [key]: value,
  }
  localStorage.setItem(localKey, JSON.stringify(updated))

  // @ts-expect-error hookable
  devtoolsContext.hooks.callHookWith((callbacks) => {
    callbacks.forEach(cb => cb({
      pluginId,
      key,
      oldValue: parsedLocalSettings[key],
      newValue: value,
      settings: updated,
    }))
  }, DevToolsV6PluginAPIHookKeys.SET_PLUGIN_SETTINGS)
}

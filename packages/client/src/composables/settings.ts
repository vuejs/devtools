import { reactive, watch } from 'vue'

const SETTINGS_STORAGE_KEY = '__VUE_DEVTOOLS_CLIENT_SETTINGS__'

export interface TabSettings {
  hiddenTabCategories: string[]
  hiddenTabs: string[]
  pinnedTabs: string[]
}

export interface DevtoolsClientSettings {
  tabSettings: TabSettings
  scale: number
  expandSidebar: boolean
  scrollableSidebar: boolean
  reduceMotion: boolean
  highlightUpdates: boolean
}

function createDefaultSettings(): DevtoolsClientSettings {
  return {
    tabSettings: {
      hiddenTabCategories: [],
      hiddenTabs: [],
      pinnedTabs: [],
    },
    scale: 1,
    expandSidebar: false,
    scrollableSidebar: true,
    reduceMotion: false,
    highlightUpdates: false,
  }
}

const settings = reactive(createDefaultSettings())

applySettings(readStoredSettings())

watch(
  settings,
  () => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch {}
  },
  { deep: true },
)

export function useDevtoolsSettings() {
  return {
    settings,
    resetDevtoolsSettings,
  }
}

export function resetDevtoolsSettings() {
  applySettings(createDefaultSettings())
}

function applySettings(next: DevtoolsClientSettings) {
  settings.scale = next.scale
  settings.expandSidebar = next.expandSidebar
  settings.scrollableSidebar = next.scrollableSidebar
  settings.reduceMotion = next.reduceMotion
  settings.highlightUpdates = next.highlightUpdates
  settings.tabSettings.hiddenTabCategories = next.tabSettings.hiddenTabCategories
  settings.tabSettings.hiddenTabs = next.tabSettings.hiddenTabs
  settings.tabSettings.pinnedTabs = next.tabSettings.pinnedTabs
}

function readStoredSettings(): DevtoolsClientSettings {
  if (typeof window === 'undefined') return createDefaultSettings()

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return createDefaultSettings()

    return normalizeSettings(JSON.parse(raw))
  } catch {
    return createDefaultSettings()
  }
}

function normalizeSettings(value: unknown): DevtoolsClientSettings {
  const defaults = createDefaultSettings()
  if (!isRecord(value)) return defaults

  const tabSettings = isRecord(value.tabSettings) ? value.tabSettings : {}

  return {
    tabSettings: {
      hiddenTabCategories: toStringArray(tabSettings.hiddenTabCategories),
      hiddenTabs: toStringArray(tabSettings.hiddenTabs),
      pinnedTabs: toStringArray(tabSettings.pinnedTabs),
    },
    scale: toNumber(value.scale, defaults.scale),
    expandSidebar: toBoolean(value.expandSidebar, defaults.expandSidebar),
    scrollableSidebar: toBoolean(value.scrollableSidebar, defaults.scrollableSidebar),
    reduceMotion: toBoolean(value.reduceMotion, defaults.reduceMotion),
    highlightUpdates: toBoolean(value.highlightUpdates, defaults.highlightUpdates),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

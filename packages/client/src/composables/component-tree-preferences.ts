import type { ComponentSnapshot } from './devtools-client'
import { getComponentPreferenceKey } from './component-tree'

const COMPONENT_TREE_PREFERENCES_STORAGE = 'vue-devtools-next:component-tree-preferences'

interface StoredComponentTreePreferences {
  favorites: Record<string, string[]>
  selections: Record<string, string>
}

export function readStoredComponentSelection(
  appName: string,
  routePath: string,
): string | undefined {
  return readPreferences().selections[getSelectionScope(appName, routePath)]
}

export function persistComponentSelection(
  appName: string,
  routePath: string,
  component: Pick<ComponentSnapshot, 'file' | 'name'>,
): void {
  const preferences = readPreferences()
  preferences.selections[getSelectionScope(appName, routePath)] =
    getComponentPreferenceKey(component)
  writePreferences(preferences)
}

export function readFavoriteComponentKeys(appName: string): Set<string> {
  return new Set(readPreferences().favorites[appName] ?? [])
}

export function toggleFavoriteComponent(
  appName: string,
  component: Pick<ComponentSnapshot, 'file' | 'name'>,
): Set<string> {
  const preferences = readPreferences()
  const favorites = new Set(preferences.favorites[appName] ?? [])
  const key = getComponentPreferenceKey(component)

  if (favorites.has(key)) favorites.delete(key)
  else favorites.add(key)

  if (favorites.size) preferences.favorites[appName] = [...favorites]
  else delete preferences.favorites[appName]
  writePreferences(preferences)
  return favorites
}

export function findPreferredComponent(
  components: ComponentSnapshot[],
  storedPreferenceKey: string | undefined,
): ComponentSnapshot | undefined {
  return components.find(
    (component) => getComponentPreferenceKey(component) === storedPreferenceKey,
  )
}

function getSelectionScope(appName: string, routePath: string): string {
  return JSON.stringify([appName, routePath])
}

function readPreferences(): StoredComponentTreePreferences {
  const fallback: StoredComponentTreePreferences = { favorites: {}, selections: {} }
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(COMPONENT_TREE_PREFERENCES_STORAGE)
    if (!raw) return fallback
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value)) return fallback

    return {
      favorites: normalizeStringArrayRecord(value.favorites),
      selections: normalizeStringRecord(value.selections),
    }
  } catch {
    return fallback
  }
}

function writePreferences(preferences: StoredComponentTreePreferences): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(COMPONENT_TREE_PREFERENCES_STORAGE, JSON.stringify(preferences))
  } catch {}
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function normalizeStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, items]) => {
      if (!Array.isArray(items)) return []
      return [[key, items.filter((item): item is string => typeof item === 'string')]]
    }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

import type { PluginDescriptor } from './api'

// Internal: not re-exported from the plugin barrel.

export interface PluginSettingsChange {
  key: string
  value: unknown
  oldValue: unknown
  settings: Record<string, unknown>
}

/**
 * Setting values for one plugin id. Adapters that register the same id for several apps
 * share one instance, so a change reaches every app's `setPluginSettings` handlers.
 */
export class PluginSettings {
  private values: Record<string, unknown>
  private readonly listeners = new Set<(change: PluginSettingsChange) => Promise<void>>()

  constructor(private readonly descriptor: PluginDescriptor) {
    this.values = readSettingsDefaults(descriptor.settings)
  }

  get(): Record<string, unknown> {
    return { ...this.values }
  }

  sync(): void {
    this.values = readSettingsDefaults(this.descriptor.settings, this.values)
  }

  subscribe(listener: (change: PluginSettingsChange) => Promise<void>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async update(key: string, value: unknown): Promise<void> {
    if (!this.descriptor.settings || !(key in this.descriptor.settings)) return

    const oldValue = this.values[key]
    this.values = { ...this.values, [key]: value }
    const change = { key, value, oldValue, settings: this.get() }
    await Promise.all([...this.listeners].map((listener) => listener(change)))
  }
}

function readSettingsDefaults(
  settings: PluginDescriptor['settings'] | undefined,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!settings) return result

  for (const [key, value] of Object.entries(settings)) {
    result[key] = key in current ? current[key] : value.defaultValue
  }

  return result
}

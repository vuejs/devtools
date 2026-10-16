import type { DevtoolsRuntime } from '../runtime'
import type {
  DevToolsPluginAPI,
  PluginApiAdapter,
  PluginDescriptor,
  PluginSetupFunction,
} from './api'
import { createPluginApiAdapter, reportPluginError } from './api'
import { PluginSettings } from './settings'

type PluginEntry = [PluginDescriptor, PluginSetupFunction]
type PluginListener = (entry: PluginEntry) => void

interface PluginRegistryState {
  bufferedPlugins: PluginEntry[]
  listeners: Set<PluginListener>
}

const PLUGIN_REGISTRY_STATE = Symbol.for('vue-devtools:plugin-registry-state')

export function setupDevToolsPlugin(
  descriptor: PluginDescriptor,
  setupFn: PluginSetupFunction,
): void {
  const state = getPluginRegistryState()
  // Pinia (and other v6 plugins) call this once per app and again per store,
  // with the same id. Each setup adds hooks; a later call must not drop the
  // earlier ones. The buffer keeps every call so a late kit replays them all.
  const entry: PluginEntry = [descriptor, setupFn]
  state.bufferedPlugins.push(entry)
  state.listeners.forEach((listener) => listener(entry))
}

export interface PluginController {
  readonly adapters: ReadonlyMap<string, PluginApiAdapter>
  register(descriptor: PluginDescriptor, setupFn: PluginSetupFunction): Promise<PluginApiAdapter>
  callHook(key: string, payload: unknown): Promise<void>
  callHookFor(pluginId: string, key: string, payload: unknown): Promise<void>
  dispose(): void
}

/**
 * Everything registered under one plugin id. Plugins such as Pinia call setup once per app
 * with the same id; each app gets its own adapter, so hooks and commands stay scoped to it,
 * while settings stay shared.
 */
class RegisteredPlugin {
  readonly adapters: PluginApiAdapter[] = []
  private readonly settings: PluginSettings

  constructor(
    descriptor: PluginDescriptor,
    private readonly runtime: DevtoolsRuntime,
    private readonly resolvePluginSettings: (
      pluginId: string,
    ) => Record<string, unknown> | undefined,
  ) {
    this.settings = new PluginSettings(descriptor)
  }

  adapterFor(descriptor: PluginDescriptor): PluginApiAdapter {
    if (this.adapters.length) {
      for (const adapter of this.adapters) mergeDescriptor(adapter.descriptor, descriptor)
      this.settings.sync()
    }
    // A setup without an app joins the first adapter.
    const existing =
      descriptor.app == null
        ? this.adapters[0]
        : this.adapters.find((adapter) => adapter.descriptor.app === descriptor.app)
    if (existing) return existing

    const adapter = createPluginApiAdapter(
      descriptor,
      this.runtime,
      this.resolvePluginSettings,
      this.settings,
    )
    this.adapters.push(adapter)
    return adapter
  }
}

export function createPluginController(runtime: DevtoolsRuntime): PluginController {
  const state = getPluginRegistryState()
  const plugins = new Map<string, RegisteredPlugin>()
  // First adapter per plugin id: what the plugin snapshot and settings commands use.
  const adapters = new Map<string, PluginApiAdapter>()
  const resolvePluginSettings = (pluginId: string) => adapters.get(pluginId)?.getSettings()

  async function register(
    descriptor: PluginDescriptor,
    setupFn: PluginSetupFunction,
  ): Promise<PluginApiAdapter> {
    let plugin = plugins.get(descriptor.id)
    if (!plugin) {
      plugin = new RegisteredPlugin(descriptor, runtime, resolvePluginSettings)
      plugins.set(descriptor.id, plugin)
    }
    const adapter = plugin.adapterFor(descriptor)
    if (!adapters.has(descriptor.id)) adapters.set(descriptor.id, adapter)
    await runPluginSetup(descriptor.id, setupFn, adapter.api)
    return adapter
  }

  const listener: PluginListener = ([descriptor, setupFn]) => {
    void register(descriptor, setupFn)
  }
  state.listeners.add(listener)
  state.bufferedPlugins.forEach(listener)
  // An unmounted app never comes back, so a later kit must not replay its setups.
  const disposeUnmount = runtime.subscribe('app:unmount', (event) => {
    if (event.type !== 'app:unmount' || event.app == null) return
    state.bufferedPlugins = state.bufferedPlugins.filter(
      ([descriptor]) => descriptor.app !== event.app,
    )
  })

  async function callAdapterHook(adapter: PluginApiAdapter, key: string, payload: unknown) {
    if (!acceptsApp(adapter.descriptor, payload)) return
    try {
      await adapter.callHook(key as never, payload as never)
    } catch (error) {
      reportPluginError(adapter.descriptor.id, `"${key}" hook`, error)
    }
  }

  return {
    adapters,
    register,
    async callHook(key, payload) {
      const all = [...plugins.values()].flatMap((plugin) => plugin.adapters)
      await Promise.all(all.map((adapter) => callAdapterHook(adapter, key, payload)))
    },
    async callHookFor(pluginId, key, payload) {
      const all = plugins.get(pluginId)?.adapters ?? []
      await Promise.all(all.map((adapter) => callAdapterHook(adapter, key, payload)))
    },
    dispose() {
      state.listeners.delete(listener)
      disposeUnmount()
      plugins.clear()
      adapters.clear()
    },
  }
}

function mergeDescriptor(target: PluginDescriptor, descriptor: PluginDescriptor): void {
  target.label = descriptor.label ?? target.label
  target.logo = descriptor.logo ?? target.logo
  target.packageName = descriptor.packageName ?? target.packageName
  target.homepage = descriptor.homepage ?? target.homepage
  target.componentStateTypes = descriptor.componentStateTypes ?? target.componentStateTypes
  target.disableAppScope = descriptor.disableAppScope ?? target.disableAppScope
  target.disablePluginScope = descriptor.disablePluginScope ?? target.disablePluginScope
  target.enableEarlyProxy = descriptor.enableEarlyProxy ?? target.enableEarlyProxy
  target.settings = descriptor.settings ?? target.settings
}

function acceptsApp(descriptor: PluginDescriptor, payload: unknown): boolean {
  if (descriptor.disableAppScope || descriptor.app == null) return true
  if (!payload || typeof payload !== 'object' || !('app' in payload)) return true
  const app = (payload as { app?: unknown }).app
  if (app == null) return true
  return app === descriptor.app
}

function getPluginRegistryState(): PluginRegistryState {
  const target = globalThis as Record<PropertyKey, unknown>
  const existing = target[PLUGIN_REGISTRY_STATE]
  if (isPluginRegistryState(existing)) return existing

  const state: PluginRegistryState = {
    bufferedPlugins: [],
    listeners: new Set(),
  }
  target[PLUGIN_REGISTRY_STATE] = state
  return state
}

function isPluginRegistryState(value: unknown): value is PluginRegistryState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<PluginRegistryState>
  return Array.isArray(state.bufferedPlugins) && state.listeners instanceof Set
}

async function runPluginSetup(
  pluginId: string,
  setupFn: PluginSetupFunction,
  api: DevToolsPluginAPI,
): Promise<void> {
  try {
    await setupFn(api)
  } catch (error) {
    reportPluginError(pluginId, 'setup', error)
  }
}

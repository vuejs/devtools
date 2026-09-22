import type { DevtoolsRuntime } from '../runtime'
import type {
  DevToolsPluginAPI,
  PluginApiAdapter,
  PluginDescriptor,
  PluginSetupFunction,
} from './api'
import { createPluginApiAdapter, reportPluginError } from './api'

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

export function createPluginController(runtime: DevtoolsRuntime): PluginController {
  const state = getPluginRegistryState()
  const adapters = new Map<string, PluginApiAdapter>()

  async function register(
    descriptor: PluginDescriptor,
    setupFn: PluginSetupFunction,
  ): Promise<PluginApiAdapter> {
    const registeredAdapter = adapters.get(descriptor.id)
    if (registeredAdapter) {
      registeredAdapter.descriptor.label = descriptor.label ?? registeredAdapter.descriptor.label
      registeredAdapter.descriptor.logo = descriptor.logo ?? registeredAdapter.descriptor.logo
      registeredAdapter.descriptor.packageName =
        descriptor.packageName ?? registeredAdapter.descriptor.packageName
      registeredAdapter.descriptor.homepage =
        descriptor.homepage ?? registeredAdapter.descriptor.homepage
      registeredAdapter.descriptor.app = descriptor.app ?? registeredAdapter.descriptor.app
      registeredAdapter.descriptor.componentStateTypes =
        descriptor.componentStateTypes ?? registeredAdapter.descriptor.componentStateTypes
      registeredAdapter.descriptor.disableAppScope =
        descriptor.disableAppScope ?? registeredAdapter.descriptor.disableAppScope
      registeredAdapter.descriptor.disablePluginScope =
        descriptor.disablePluginScope ?? registeredAdapter.descriptor.disablePluginScope
      registeredAdapter.descriptor.enableEarlyProxy =
        descriptor.enableEarlyProxy ?? registeredAdapter.descriptor.enableEarlyProxy
      registeredAdapter.descriptor.settings =
        descriptor.settings ?? registeredAdapter.descriptor.settings
      registeredAdapter.syncSettings()
      await runPluginSetup(descriptor.id, setupFn, registeredAdapter.api)
      return registeredAdapter
    }

    const adapter = createPluginApiAdapter(descriptor, runtime, (pluginId) =>
      adapters.get(pluginId)?.getSettings(),
    )
    adapters.set(descriptor.id, adapter)
    await runPluginSetup(descriptor.id, setupFn, adapter.api)
    return adapter
  }

  const listener: PluginListener = ([descriptor, setupFn]) => {
    void register(descriptor, setupFn)
  }
  state.listeners.add(listener)
  state.bufferedPlugins.forEach(listener)

  return {
    adapters,
    register,
    async callHook(key, payload) {
      await Promise.all(
        [...adapters.values()].map(async (adapter) => {
          if (!acceptsApp(adapter.descriptor, payload)) return
          try {
            await adapter.callHook(key as never, payload as never)
          } catch (error) {
            reportPluginError(adapter.descriptor.id, `"${key}" hook`, error)
          }
        }),
      )
    },
    async callHookFor(pluginId, key, payload) {
      const adapter = adapters.get(pluginId)
      if (!adapter || !acceptsApp(adapter.descriptor, payload)) return
      try {
        await adapter.callHook(key as never, payload as never)
      } catch (error) {
        reportPluginError(adapter.descriptor.id, `"${key}" hook`, error)
      }
    },
    dispose() {
      state.listeners.delete(listener)
      adapters.clear()
    },
  }
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

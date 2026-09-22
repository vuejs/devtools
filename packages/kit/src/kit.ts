import type { DevtoolsHookTarget, InstalledDevtoolsHook } from './hook'
import type { PluginController, PluginDescriptor, PluginSetupFunction } from './plugin'
import type { DevtoolsCapabilitiesMessage, PluginsSnapshotMessage } from './protocol'
import type { DevtoolsRpcServer } from './rpc'
import type {
  ComponentInspectorDockController,
  RuntimeBudgetInput,
  DevtoolsRuntime,
} from './runtime'
import { installDevtoolsHook } from './hook'
import { createPluginController } from './plugin'
import { markDevToolsRuntimeConnected } from './plugin/lifecycle'
import { createDevtoolsRpcServer } from './rpc'
import { createDevtoolsRuntime } from './runtime'

export interface DevtoolsKitTarget {
  name: string
  version?: string
}

export interface DevtoolsKitOptions {
  target: DevtoolsKitTarget
  enabled?: boolean
  clientName?: string
  hook?: {
    install?: boolean
    replay?: boolean
    target?: DevtoolsHookTarget
  }
  budget?: RuntimeBudgetInput
  capabilities?: Partial<DevtoolsCapabilitiesMessage>
  componentInspectorDockController?: ComponentInspectorDockController
}

export interface DevtoolsKit {
  clientName: string
  target: DevtoolsKitTarget
  enabled: boolean
  runtime: DevtoolsRuntime
  rpc: DevtoolsRpcServer
  plugins: PluginController
  install(): void
  dispose(): void | Promise<void>
}

const DEVTOOLS_KIT_OWNERS = Symbol.for('vue-devtools-next:kit-owners')

export function createDevtoolsKit(options: DevtoolsKitOptions): DevtoolsKit {
  const enabled = options.enabled ?? true
  const clientName = options.clientName ?? options.target.name
  const ownerTarget = (options.hook?.target ?? globalThis) as DevtoolsHookTarget & {
    [DEVTOOLS_KIT_OWNERS]?: Map<string, DevtoolsKit>
  }
  const runtime = createDevtoolsRuntime({
    budget: options.budget,
    collectionInitiallyActive: false,
    componentInspectorDockController: options.componentInspectorDockController,
  })
  const rpc = createDevtoolsRpcServer(runtime)
  const plugins = createPluginController(runtime)
  const capabilities = Object.freeze<DevtoolsCapabilitiesMessage>({
    openInEditor: options.capabilities?.openInEditor ?? false,
    pagedComponentTree: true,
  })
  runtime.setPluginHookRunner((key, payload, pluginId) =>
    pluginId ? plugins.callHookFor(pluginId, key, payload) : plugins.callHook(key, payload),
  )
  const disposers: Array<() => void> = []
  let installedHook: InstalledDevtoolsHook | undefined
  let disposeRuntimeConnection: (() => void) | undefined
  let installed = false
  let disposed = false

  disposers.push(
    runtime.registerQuery('devtools:capabilities', () => capabilities),
    runtime.subscribe('plugin:setup', (event) => {
      if (isPluginDescriptor(event.descriptor) && typeof event.setup === 'function')
        void plugins.register(event.descriptor, event.setup as PluginSetupFunction)
    }),
    runtime.registerQuery<PluginsSnapshotMessage>('plugins:snapshot', () => ({
      plugins: [...plugins.adapters.values()].map((adapter) => ({
        id: adapter.descriptor.id,
        label: adapter.descriptor.label,
        logo: adapter.descriptor.logo,
        packageName: adapter.descriptor.packageName,
        homepage: adapter.descriptor.homepage,
        settings: adapter.descriptor.settings ?? {},
        settingValues: adapter.getSettings(),
      })),
    })),
    runtime.registerCommand('plugins:updateSetting', async (command) => {
      const pluginId = readString(command.payload, 'pluginId')
      const key = readString(command.payload, 'key')
      if (!pluginId || !key) return { status: 0, error: 'Invalid plugin setting payload' }

      const adapter = plugins.adapters.get(pluginId)
      if (!adapter) return { status: 0, error: `Unknown plugin: ${pluginId}` }
      if (!adapter.descriptor.settings || !(key in adapter.descriptor.settings))
        return { status: 0, error: `Unknown plugin setting: ${key}` }

      await adapter.updateSetting(key, readUnknownProperty(command.payload, 'value'))
      return { status: 1 }
    }),
  )

  const kit: DevtoolsKit = {
    clientName,
    target: options.target,
    enabled,
    runtime,
    rpc,
    plugins,
    install() {
      if (installed) return

      const owners = ownerTarget[DEVTOOLS_KIT_OWNERS] ?? new Map<string, DevtoolsKit>()
      const previousOwner = owners.get(clientName)
      if (previousOwner && previousOwner !== kit) void previousOwner.dispose()
      owners.set(clientName, kit)
      ownerTarget[DEVTOOLS_KIT_OWNERS] = owners

      installed = true
      disposed = false

      if (enabled && options.hook?.install !== false) {
        installedHook = installDevtoolsHook({
          runtime,
          replay: options.hook?.replay,
          target: options.hook?.target,
        })
      }

      if (enabled) disposeRuntimeConnection = markDevToolsRuntimeConnected()
    },
    async dispose() {
      if (disposed) return
      disposed = true
      installedHook?.dispose()
      installedHook = undefined
      disposeRuntimeConnection?.()
      disposeRuntimeConnection = undefined
      installed = false
      disposers.forEach((dispose) => dispose())
      rpc.dispose()
      plugins.dispose()
      runtime.dispose()
      const owners = ownerTarget[DEVTOOLS_KIT_OWNERS]
      if (owners?.get(clientName) === kit) owners.delete(clientName)
    },
  }

  return kit
}

function isPluginDescriptor(value: unknown): value is PluginDescriptor {
  return (
    value != null && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
  )
}

function readString(target: unknown, key: string): string | undefined {
  if (!isRecord(target)) return
  const value = target[key]
  return typeof value === 'string' ? value : undefined
}

function readUnknownProperty(target: unknown, key: string): unknown {
  return isRecord(target) ? target[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

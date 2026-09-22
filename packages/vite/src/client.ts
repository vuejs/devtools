import type { DevToolsClientContext, DockClientScriptContext } from '@vitejs/devtools-kit/client'
import type { DevtoolsHookTarget, DevtoolsKit } from '@vue/devtools-kit'
import { startIframeDevtoolsRpcHost, createDevtoolsKit } from '@vue/devtools-kit'
import { CLIENT_RUNTIME_KEY } from './constants'
import { createVueDevToolsDockBinding, type VueDevToolsDockBinding } from './utils/dock/binding'

export interface InstallVueDevToolsOptions {
  enabled: boolean
}

interface VueDevToolsClientState {
  kit?: DevtoolsKit
  context?: DevToolsClientContext | DockClientScriptContext
  bindDock?: typeof setupVueDevToolsDockController
  dockBinding?: VueDevToolsDockBinding
  disposeRpcHost?: () => void
}

interface VueDevToolsTarget extends DevtoolsHookTarget {
  __VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__?: boolean
  [CLIENT_RUNTIME_KEY]?: VueDevToolsClientState
}

export function installVueDevTools(options: InstallVueDevToolsOptions): DevtoolsKit {
  const target = getTarget()
  const state = getClientState()

  if (!state.kit) {
    state.kit = createDevtoolsKit({
      target: {
        name: 'vue devtools',
      },
      enabled: options.enabled,
      capabilities: {
        openInEditor: true,
      },
      hook: {
        target,
      },
      componentInspectorDockController: {
        closeForComponentInspection: () => state.dockBinding?.closeForComponentInspection(),
      },
    })
    state.kit.install()
    state.disposeRpcHost = startIframeDevtoolsRpcHost(state.kit.rpc, {
      window: typeof window !== 'undefined' ? window : undefined,
    })
    state.bindDock = setupVueDevToolsDockController
  }

  target.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__ = true
  setupVueDevToolsDockController()

  return state.kit
}

export const injectVueDevTools = installVueDevTools

export function setupVueDevToolsDockController(
  context?: DevToolsClientContext | DockClientScriptContext,
): void {
  const state = getClientState()
  if (context) state.context = context
  if (!state.context || !state.kit) return
  state.dockBinding?.dispose()
  state.dockBinding = createVueDevToolsDockBinding(state.context, state.kit.runtime)
}

export function disposeVueDevTools(): void {
  const state = getClientState()
  state.dockBinding?.dispose()
  state.disposeRpcHost?.()
  void state.kit?.dispose()
  delete state.dockBinding
  delete state.disposeRpcHost
  delete state.kit
  delete state.bindDock
}

function getClientState(): VueDevToolsClientState {
  return (getTarget()[CLIENT_RUNTIME_KEY] ??= {})
}

function getTarget(): typeof globalThis & VueDevToolsTarget {
  return (typeof window !== 'undefined' ? window : globalThis) as typeof globalThis &
    VueDevToolsTarget
}

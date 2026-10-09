import type { DevToolsClientContext, DockClientScriptContext } from '@vitejs/devtools-kit/client'
import type { VueDevtoolsAgentPage } from '@vue/devtools-agentic'
import type { DevtoolsHookTarget, DevtoolsKit } from '@vue/devtools-kit'
import {
  startIframeDevtoolsRpcHost,
  createDevtoolsKit,
  connectDevtoolsIframeClient,
} from '@vue/devtools-kit'
import { CLIENT_RUNTIME_KEY } from './constants'
import { createVueDevToolsDockBinding, type VueDevToolsDockBinding } from './utils/dock/binding'

export interface InstallVueDevToolsOptions {
  enabled: boolean
}

interface VueDevToolsAgentSetup {
  kit: DevtoolsKit
  rpc: DevToolsClientContext['rpc']
}

interface VueDevToolsClientState {
  kit?: DevtoolsKit
  context?: DevToolsClientContext | DockClientScriptContext
  bindDock?: typeof setupVueDevToolsDockController
  dockBinding?: VueDevToolsDockBinding
  disposeRpcHost?: () => void
  agentSetup?: VueDevToolsAgentSetup
  disposeAgent?: () => void
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
  const rpc = state.context.rpc
  if (!rpc?.connectionMeta.mcp) {
    disposeAgent(state)
    return
  }
  if (state.agentSetup?.kit === state.kit && state.agentSetup.rpc === rpc) return
  disposeAgent(state)
  const setup = { kit: state.kit, rpc }
  state.agentSetup = setup
  void setupAgent(state, setup).catch((error) => {
    if (state.agentSetup !== setup) return
    disposeAgent(state)
    console.error('[vue-devtools] Failed to register agent tools', error)
  })
}

export function disposeVueDevTools(): void {
  const state = getClientState()
  disposeAgent(state)
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

function disposeAgent(state: VueDevToolsClientState): void {
  state.disposeAgent?.()
  delete state.disposeAgent
  delete state.agentSetup
}

async function setupAgent(
  state: VueDevToolsClientState,
  setup: VueDevToolsAgentSetup,
): Promise<void> {
  const { createVueDevtoolsAgentSession, registerVueDevtoolsAgentPage } =
    await import('@vue/devtools-agentic/devframe')
  if (
    state.kit !== setup.kit ||
    state.agentSetup !== setup ||
    !setup.rpc.connectionMeta.mcp ||
    typeof window === 'undefined'
  )
    return
  const connection = createVueDevtoolsAgentSession(() =>
    connectDevtoolsIframeClient({ targetWindow: window }),
  )
  const page: VueDevtoolsAgentPage = {
    id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
    get url() {
      return location.href
    },
    get title() {
      return document.title
    },
  }
  let disposeTools = () => {}
  state.disposeAgent = () => {
    disposeTools()
    connection.dispose()
  }
  try {
    disposeTools = registerVueDevtoolsAgentPage(connection, page)
  } catch (error) {
    state.disposeAgent()
    delete state.disposeAgent
    throw error
  }
}

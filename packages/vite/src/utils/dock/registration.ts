import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import { DOCK_ENTRY_ID, getClientBasePath, getClientDockModulePath } from '../../constants'
import { clientDist } from '../../dirs'

export function createVueDevToolsDockRegistrationPlugin(): PluginWithDevTools {
  let base = '/'
  let mcpEnabled = true
  let disposeAgentHost: (() => void) | undefined

  return {
    name: 'vue-devtools:dock-registration',
    apply: 'serve',
    configResolved(config) {
      base = config.base
      mcpEnabled = !!config.devtools && config.devtools.config.mcp !== false
      if (!config.devtools) {
        config.logger.warn(
          "[vite-plugin-vue-devtools] Vue DevTools requires Vite DevTools. Install @vitejs/devtools and set devtools: { apply: 'serve' } in your Vite config.",
        )
      }
    },
    closeBundle() {
      disposeAgentHost?.()
      disposeAgentHost = undefined
    },
    devtools: {
      async setup(ctx) {
        if (mcpEnabled) {
          const { registerVueDevtoolsAgentHost } = await import('@vue/devtools-agentic/node')
          disposeAgentHost?.()
          disposeAgentHost = registerVueDevtoolsAgentHost(ctx)
        }
        const clientUrl = getClientBasePath(base)

        ctx.views.hostStatic(clientUrl, clientDist)
        ctx.docks.register({
          id: DOCK_ENTRY_ID,
          title: 'Vue DevTools',
          category: 'framework',
          icon: 'logos:vue',
          type: 'iframe',
          url: clientUrl,
          frameId: DOCK_ENTRY_ID,
          clientScript: {
            importFrom: getClientDockModulePath(base),
            ...(mcpEnabled ? { eager: true } : {}),
          },
        })
      },
    },
  }
}

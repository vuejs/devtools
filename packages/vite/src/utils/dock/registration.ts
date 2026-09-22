import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import { DOCK_ENTRY_ID, getClientBasePath, getClientDockModulePath } from '../../constants'
import { clientDist } from '../../dirs'

export function createVueDevToolsDockRegistrationPlugin(): PluginWithDevTools {
  let base = '/'

  return {
    name: 'vue-devtools:dock-registration',
    apply: 'serve',
    configResolved(config) {
      base = config.base
      if (!config.devtools) {
        config.logger.warn(
          '[vite-plugin-vue-devtools] Vue DevTools requires Vite DevTools. Install @vitejs/devtools and set devtools: true in your Vite config.',
        )
      }
    },
    devtools: {
      setup(ctx) {
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
          },
        })
      },
    },
  }
}

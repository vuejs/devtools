import '@unocss/reset/tailwind.css'
import 'uno.css'
import '@vue/devtools-ui/style.css'

import { getViteClient } from 'vite-hot-client'
import { isInChromePanel, isInSeparateWindow } from '@vue/devtools-shared'
import { VueDevToolsVuePlugin, createViteClientRpc, functions, rpc } from '@vue/devtools-core'
import { createRpcClient, setViteClientContext } from '@vue/devtools-kit'
import { createApp } from 'vue'
import type { App as VueApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'
import Components from '~/pages/components.vue'
import Overview from '~/pages/overview.vue'
import PiniaPage from '~/pages/pinia.vue'
import RouterPage from '~/pages/router.vue'
import Pages from '~/pages/pages.vue'
import Assets from '~/pages/assets.vue'
import Graph from '~/pages/graph.vue'
import Index from '~/pages/index.vue'
import Settings from '~/pages/settings.vue'
import CustomTabView from '~/pages/custom-tab-view.vue'
import CustomInspectorTabView from '~/pages/custom-inspector-tab-view.vue'
import WaitForConnection from '~/components/WaitForConnection.vue'

import '~/assets/styles/main.css'

const routes = [
  { path: '/', component: Index },
  { path: '/overview', component: Overview },
  { path: '/components', component: Components },
  { path: '/pinia', component: PiniaPage },
  { path: '/router', component: RouterPage },
  { path: '/pages', component: Pages },
  { path: '/assets', component: Assets },
  { path: '/graph', component: Graph },
  { path: '/settings', component: Settings },
  { path: `/${CUSTOM_TAB_VIEW}/:name`, component: CustomTabView },
  { path: `/${CUSTOM_INSPECTOR_TAB_VIEW}/:name`, component: CustomInspectorTabView },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.use(VueDevToolsVuePlugin())
app.mount('#app')

async function getViteHotContext() {
  if (isInChromePanel)
    return

  const viteClient = await getViteClient(`${location.pathname.split('/__devtools__')[0] || ''}/`.replace(/\/\//g, '/'), false)
  return viteClient?.createHotContext('/____')
}

export async function initViteClientHotContext() {
  const context = await getViteHotContext()
  context && setViteClientContext(context)
  return context
}

initViteClientHotContext().then((ctx) => {
  if (ctx) {
    createViteClientRpc()
  }
})

// heartbeat()

if (isInSeparateWindow) {
  createRpcClient(functions, {
    preset: 'broadcast',
  })
}
else {
  createRpcClient(functions, {
    preset: 'iframe',
  })
}

let vueApp: VueApp = null!
export function initDevTools() {
  const app = createApp(App)
  app.use(router)
  app.use(VueDevToolsVuePlugin())
  vueApp = app
  app.mount('#app')
}

export function createConnectionApp(container: string = '#app', props?: Record<string, string>) {
  const app = createApp(WaitForConnection, {
    ...props,
  })
  app.mount(container)
  return app
}

export function disconnectDevToolsClient() {
  vueApp?.config.globalProperties.$disconnectDevToolsClient()
}

export function reloadDevToolsClient() {
  rpc.value.initDevToolsServerListener()
  vueApp?.config?.globalProperties?.$getDevToolsState()
}

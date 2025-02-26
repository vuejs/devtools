import type { App as VueApp } from 'vue'
import { createViteClientRpc, functions, rpc, VueDevToolsVuePlugin } from '@vue/devtools-core'
import { createRpcClient, setViteClientContext } from '@vue/devtools-kit'

import { isInChromePanel, isInSeparateWindow } from '@vue/devtools-shared'
import { getViteClient } from 'vite-hot-client'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import WaitForConnection from '~/components/WaitForConnection.vue'
import Assets from '~/pages/assets.vue'
import Components from '~/pages/components.vue'
import CustomInspectorTabView from '~/pages/custom-inspector-tab-view.vue'
import CustomTabView from '~/pages/custom-tab-view.vue'
import Graph from '~/pages/graph.vue'
import Overview from '~/pages/overview.vue'
import Pages from '~/pages/pages.vue'
import PiniaPage from '~/pages/pinia.vue'
import RouterPage from '~/pages/router.vue'
import Settings from '~/pages/settings.vue'
import Timeline from '~/pages/timeline.vue'
import App from './App.vue'
import '@unocss/reset/tailwind.css'
import 'uno.css'
import '@vue/devtools-ui/style.css'

import '~/assets/styles/main.css'

const routes = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', component: Overview },
  { path: '/components', component: Components },
  { path: '/pinia', component: PiniaPage },
  { path: '/router', component: RouterPage },
  { path: '/pages', component: Pages },
  { path: '/timeline', component: Timeline },
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

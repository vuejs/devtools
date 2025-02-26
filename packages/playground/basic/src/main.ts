import type { RouteRecordRaw } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { addCustomCommand } from '@vue/devtools'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'

import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

import Hey from './pages/Hey.vue'
import Home from './pages/Home.vue'
import VeeValidate from './pages/VeeValidate.vue'
import VueQuery from './pages/VueQuery.vue'
import store from './stores/vuexStore'
import 'element-plus/dist/index.css'
import './style.css'
import 'uno.css'

const pinia = createPinia()
const app = createApp(App)
app.use(ElementPlus)

// devtools.connect()

// // @ts-expect-error skip type check
// window.VUE_DEVTOOLS_CONFIG = {
//   openInEditorHost: 'http://localhost:3000',
// }

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Home,
    name: 'home',
    alias: '/index',
  },
  {
    path: '/hello',
    component: () => import('./pages/Hello.vue'),
    name: 'hello',
    meta: { auth: 'admin', note: 'Hey! Manger' },
  },
  {
    path: '/hey/:id',
    component: Hey,
    name: 'hey',
    meta: { auth: 'user', note: 'Hey!' },
  },
  {
    path: '/vue-query',
    component: VueQuery,
    name: 'vue-query',
  },
  {
    path: '/vee-validate',
    component: VeeValidate,
    name: 'vee-validate',
  },
  {
    path: '/circular-state',
    component: () => import('./pages/CircularState.vue'),
    name: 'circular-state',
  },
  {
    path: '/interval-update',
    component: () => import('./pages/IntervalUpdate.vue'),
    name: 'interval-update',
  },
  {
    path: '/prop-mutation',
    component: () => import('./pages/PropMutation.vue'),
    name: 'prop-mutation',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

app.use(VueQueryPlugin, {
  enableDevtoolsV6Plugin: true,
})
app.use(router)
app.use(pinia)
app.use(store)

app.mount('#app')

setTimeout(() => {
  addCustomCommand({
    id: 'vueuse',
    title: 'VueUse',
    icon: 'https://vueuse.org/favicon.svg',
    children: [
      {
        id: 'vueuse-docs',
        title: 'Docs',
        icon: 'auto-awesome',
        action: {
          type: 'url',
          src: 'https://vueuse.org/',
        },
      },
    ],
  })
}, 2000)

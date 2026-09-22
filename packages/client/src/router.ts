import type { RouteRecordRaw } from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/components' },
  {
    path: '/overview',
    component: () => import('./pages/overview.vue'),
    meta: { tabId: 'overview' },
  },
  {
    path: '/components',
    component: () => import('./pages/components.vue'),
    meta: { tabId: 'components' },
  },
  {
    path: '/pages',
    component: () => import('./pages/pages.vue'),
    meta: { tabId: 'pages' },
  },
  {
    path: '/timeline',
    component: () => import('./pages/timeline.vue'),
    meta: { tabId: 'timeline' },
  },
  {
    path: '/inspectors/:inspectorId',
    name: 'custom-inspector',
    component: () => import('./pages/custom-inspector.vue'),
  },
  {
    path: '/plugins',
    component: () => import('./pages/plugins.vue'),
    meta: { tabId: 'plugins' },
  },
  {
    path: '/graph',
    component: () => import('./pages/graph.vue'),
    meta: { tabId: 'graph' },
  },
  {
    path: '/settings',
    component: () => import('./pages/settings.vue'),
    meta: { tabId: 'settings' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/components',
  },
]

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

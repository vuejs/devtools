import type { RouteLocationNormalizedLoaded, RouteRecordNormalized } from 'vue-router'

export type { Router } from 'vue-router'
export interface RouterInfo {
  currentRoute: RouteLocationNormalizedLoaded | null | Record<string, any>
  routes: RouteRecordNormalized[]
  // router: Router | null
}

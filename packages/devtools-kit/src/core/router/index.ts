import type { RouteLocationNormalizedLoaded, Router, RouteRecordRaw } from 'vue-router'
import type { AppRecord } from '../../types'
import { deepClone, target as global } from '@vue/devtools-shared'
import { debounce } from 'perfect-debounce'
import { devtoolsContext, DevToolsMessagingHookKeys, devtoolsState } from '../../ctx'
import { ROUTER_INFO_KEY, ROUTER_KEY } from '../../ctx/router'
import { hook } from '../../hook'
// import { DevToolsEvents, apiHooks } from '../../api/hook'

function getRoutes(router?: Router) {
  const routesMap = new Map()
  return (router?.getRoutes() || []).filter(i => !routesMap.has(i.path) && routesMap.set(i.path, 1))
}

function filterRoutes(routes: RouteRecordRaw[]) {
  return routes.map((item) => {
    let { path, name, children, meta } = item
    if (children?.length)
      children = filterRoutes(children)

    return {
      path,
      name,
      children,
      meta,
    }
  })
}

function filterCurrentRoute(route: RouteLocationNormalizedLoaded & { href?: string } | undefined) {
  if (route) {
    const { fullPath, hash, href, path, name, matched, params, query } = route
    return {
      fullPath,
      hash,
      href,
      path,
      name,
      params,
      query,
      matched: filterRoutes(matched),
    }
  }
  return route
}

export function normalizeRouterInfo(appRecord: AppRecord, activeAppRecord: { value: AppRecord }) {
  function init() {
    const router = appRecord.app?.config.globalProperties.$router as Router | undefined
    const currentRoute = filterCurrentRoute(router?.currentRoute.value)
    const routes = filterRoutes(getRoutes(router))
    const c = console.warn
    console.warn = () => {}
    global[ROUTER_INFO_KEY] = {
      currentRoute: currentRoute ? deepClone(currentRoute) : {},
      routes: deepClone(routes),
    }
    global[ROUTER_KEY] = router!
    console.warn = c
  }

  init()

  hook.on.componentUpdated(debounce(() => {
    if (activeAppRecord.value?.app !== appRecord.app)
      return

    init()
    if (devtoolsState.highPerfModeEnabled)
      return
    devtoolsContext.hooks.callHook(DevToolsMessagingHookKeys.ROUTER_INFO_UPDATED, { state: global[ROUTER_INFO_KEY] })
  }, 200))
}
export function getRouterDevToolsId(id: string) {
  return id.replace(/\D/g, '') || '0'
}

import { createMatchedRouteSnapshot, createRouterSnapshot, navigateRouter } from '../router'
import type { DevtoolsRuntime } from '../runtime'
import { readString } from './shared'

export function registerRouterHandlers(runtime: DevtoolsRuntime) {
  runtime.registerQuery('router:snapshot', (query) => {
    const record = query.appId
      ? runtime.registry.getApp(query.appId)
      : runtime.registry.listApps()[0]
    return createRouterSnapshot(record)
  })

  runtime.registerQuery('router:matchedRoutes', (query) => {
    const record = query.appId
      ? runtime.registry.getApp(query.appId)
      : runtime.registry.listApps()[0]
    const path = readString(query.payload, 'path') ?? '/'
    return {
      appId: record?.id,
      path,
      routes: createMatchedRouteSnapshot(record, path),
    }
  })

  runtime.registerCommand('router:navigate', async (command) => {
    const path = readString(command.payload, 'path')
    if (!path) return { status: 0, error: 'Invalid route path' }

    const record = command.appId
      ? runtime.registry.getApp(command.appId)
      : runtime.registry.listApps()[0]
    const navigated = await navigateRouter(record, path)
    return navigated ? { status: 1 } : { status: 0, error: 'Unable to navigate route' }
  })
}

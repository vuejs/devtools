import type {
  RouterRouteRecordSnapshot,
  RouterRouteSnapshot,
  RouterSnapshotMessage,
} from '../protocol'
import type { AppRecord } from './registry'

interface RouterLike {
  currentRoute?: {
    value?: unknown
  }
  getRoutes?: () => unknown[]
  push?: (to: string) => unknown
  resolve?: (to: string) => unknown
}

export function createRouterSnapshot(record: AppRecord | undefined): RouterSnapshotMessage {
  const router = record ? readAppRouter(record.app) : undefined
  const routes = dedupeRoutes(readRoutes(router))

  return {
    appId: record?.id,
    currentRoute: readCurrentRoute(router),
    routes,
  }
}

export function createMatchedRouteSnapshot(
  record: AppRecord | undefined,
  path: string,
): RouterRouteRecordSnapshot[] {
  const router = record ? readAppRouter(record.app) : undefined
  if (typeof router?.resolve !== 'function') return []

  try {
    const resolved = router.resolve(path)
    return isRecord(resolved)
      ? (readRouteArray(readUnknownProperty(resolved, 'matched')) ?? [])
      : []
  } catch {
    return []
  }
}

export async function navigateRouter(
  record: AppRecord | undefined,
  path: string,
): Promise<boolean> {
  const router = record ? readAppRouter(record.app) : undefined
  if (typeof router?.push !== 'function') return false

  try {
    await router.push(path)
    return true
  } catch {
    return false
  }
}

function readAppRouter(app: object): RouterLike | undefined {
  const globalProperties = readNestedObjectProperty(app, ['config', 'globalProperties'])
  const router = globalProperties ? readUnknownProperty(globalProperties, '$router') : undefined
  return isRouterLike(router) ? router : undefined
}

function isRouterLike(value: unknown): value is RouterLike {
  return value != null && typeof value === 'object'
}

function readRoutes(router: RouterLike | undefined): RouterRouteRecordSnapshot[] {
  if (typeof router?.getRoutes !== 'function') return []

  try {
    return router.getRoutes().map(readRouteRecord).filter(isDefined)
  } catch {
    return []
  }
}

function dedupeRoutes(routes: RouterRouteRecordSnapshot[]): RouterRouteRecordSnapshot[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    if (seen.has(route.path)) return false
    seen.add(route.path)
    return true
  })
}

function readCurrentRoute(router: RouterLike | undefined): RouterRouteSnapshot | undefined {
  const route = router?.currentRoute?.value
  if (!isRecord(route)) return

  return {
    fullPath: readStringProperty(route, 'fullPath'),
    hash: readStringProperty(route, 'hash'),
    href: readStringProperty(route, 'href'),
    path: readStringProperty(route, 'path'),
    name: readNameProperty(route, 'name'),
    params: clonePlainRecord(readUnknownProperty(route, 'params')),
    query: clonePlainRecord(readUnknownProperty(route, 'query')),
    matched: readRouteArray(readUnknownProperty(route, 'matched')),
  }
}

function readRouteArray(value: unknown): RouterRouteRecordSnapshot[] | undefined {
  if (!Array.isArray(value)) return
  return value.map(readRouteRecord).filter(isDefined)
}

function readRouteRecord(value: unknown): RouterRouteRecordSnapshot | undefined {
  if (!isRecord(value)) return

  const path = readStringProperty(value, 'path')
  if (!path) return

  const children = readRouteArray(readUnknownProperty(value, 'children'))

  return {
    path,
    name: readNameProperty(value, 'name'),
    children: children?.length ? children : undefined,
    meta: clonePlainRecord(readUnknownProperty(value, 'meta')),
  }
}

function readNameProperty(target: Record<string, unknown>, key: string): string | undefined {
  const value = readUnknownProperty(target, key)
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'symbol'
    ? String(value)
    : undefined
}

function clonePlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return

  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown
    return isRecord(cloned) ? cloned : undefined
  } catch {
    return
  }
}

function readNestedObjectProperty(target: object, keys: string[]): object | undefined {
  let current: object | undefined = target
  for (const key of keys) {
    if (!current) return
    current = readObjectProperty(current, key)
  }
  return current
}

function readObjectProperty(target: object, key: string): object | undefined {
  const value = readUnknownProperty(target, key)
  return value != null && typeof value === 'object' ? value : undefined
}

function readStringProperty(target: Record<string, unknown>, key: string): string | undefined {
  const value = readUnknownProperty(target, key)
  return typeof value === 'string' ? value : undefined
}

function readUnknownProperty(target: object, key: string): unknown {
  return (target as Record<string, unknown>)[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

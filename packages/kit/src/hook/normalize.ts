import type { AppId, RuntimeEvent } from '../runtime'
import type {
  DevtoolsHookEvent,
  HookApp,
  HookAppInitPayload,
  HookAppUnmountPayload,
  HookComponentPayload,
} from './types'
import { RuntimeRegistry } from '../runtime'

export function normalizeHookEvent(
  registry: RuntimeRegistry,
  event: DevtoolsHookEvent | string,
  payload: unknown[],
  time = Date.now(),
): RuntimeEvent | undefined {
  switch (event) {
    case 'app:init': {
      const [app, version, vueTypes] = payload as HookAppInitPayload
      if (!app || isHiddenDevtoolsApp(app)) return
      return { type: 'app:init', app, version, vueTypes, time }
    }
    case 'app:unmount': {
      const [app] = payload as HookAppUnmountPayload
      if (!app) return
      return { type: 'app:unmount', app, time }
    }
    case 'component:added':
    case 'component:updated': {
      const [app, , , instance] = payload as HookComponentPayload
      if (!app || !instance || isHiddenDevtoolsApp(app)) return
      const appId = resolveHookAppId(registry, app)
      if (!appId) return
      return {
        type: event === 'component:added' ? 'component:add' : 'component:update',
        appId,
        app,
        instance,
        parent: readParent(instance),
        time,
      }
    }
    case 'component:removed': {
      const [app, , , instance] = payload as HookComponentPayload
      if (!app || isHiddenDevtoolsApp(app)) return
      const appId = resolveHookAppId(registry, app)
      if (!appId) return
      return {
        type: 'component:remove',
        appId,
        app,
        instance,
        parent: instance ? readParent(instance) : undefined,
        time,
      }
    }
    case 'component:emit': {
      const [app, instance, emittedEvent, args] = payload as [HookApp, object, string, unknown[]]
      if (!app || !instance || !emittedEvent || isHiddenDevtoolsApp(app)) return
      const appId = resolveHookAppId(registry, app)
      if (!appId) return
      return {
        type: 'component:emit',
        appId,
        app,
        instance,
        event: emittedEvent,
        args: Array.isArray(args) ? args : [args],
        time,
      }
    }
    case 'perf:start':
    case 'perf:end': {
      const [app, , instance, phase, timestamp] = payload as [
        HookApp,
        number,
        object,
        string,
        number,
      ]
      if (!app || !instance || isHiddenDevtoolsApp(app)) return
      const appId = resolveHookAppId(registry, app)
      if (!appId) return
      return {
        type: event === 'perf:start' ? 'perf:start' : 'perf:end',
        appId,
        app,
        instance,
        phase,
        timestamp,
        time,
      }
    }
    case 'devtools-plugin:setup': {
      const [descriptor, setup] = payload
      return { type: 'plugin:setup', descriptor, setup, time }
    }
  }
}

function resolveHookAppId(registry: RuntimeRegistry, app: HookApp): AppId | undefined {
  return registry.getAppByRef(app)?.id
}

function isHiddenDevtoolsApp(app: HookApp): boolean {
  if (
    isViteDevtoolsCustomElement(app._instance) ||
    isViteDevtoolsCustomElement((app as { _container?: { host?: unknown } })._container?.host)
  )
    return true

  const rootType = (app._instance as { type?: unknown } | undefined)?.type
  if (!rootType || typeof rootType !== 'object') return false

  const devtools = (rootType as { devtools?: { hide?: boolean } }).devtools
  return devtools?.hide === true
}

function isViteDevtoolsCustomElement(value: unknown): boolean {
  const element = readCustomElement(value)
  return element?.tagName.toLowerCase().startsWith('vite-devtools-') === true
}

function readCustomElement(value: unknown): { tagName: string } | undefined {
  if (!value || typeof value !== 'object') return

  const tagName = (value as { tagName?: unknown }).tagName
  if (typeof tagName === 'string') return { tagName }

  const customElement = (value as { ce?: unknown }).ce
  if (customElement && typeof customElement === 'object') {
    const ceTagName = (customElement as { tagName?: unknown }).tagName
    if (typeof ceTagName === 'string') return { tagName: ceTagName }
  }
}

function readParent(instance: object): object | undefined {
  const parent = (instance as { parent?: object }).parent
  return parent && typeof parent === 'object' ? parent : undefined
}

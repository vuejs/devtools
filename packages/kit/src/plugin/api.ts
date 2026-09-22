import type { ComponentId, DevtoolsRuntime, InspectorId, MaybePromise, PluginId } from '../runtime'

export interface PluginDescriptor {
  id: PluginId
  label?: string
  logo?: string
  app?: object
  packageName?: string
  homepage?: string
  componentStateTypes?: string[]
  disableAppScope?: boolean
  disablePluginScope?: boolean
  /**
   * Run plugin setup before a DevTools UI client connects so early timeline
   * events and inspector registrations can be buffered.
   */
  enableEarlyProxy?: boolean
  settings?: Record<string, PluginSettingsItem>
}

export interface PluginSettingOption {
  value: string | number
  label: string
}

export interface PluginSettingsItem {
  label?: string
  description?: string
  type?: 'boolean' | 'choice' | 'text' | 'number'
  defaultValue?: unknown
  options?: PluginSettingOption[]
  component?: 'select' | 'button-group'
  [key: string]: unknown
}

export type PluginSetupFunction = (api: DevToolsPluginAPI) => void | Promise<void>

export interface CustomInspectorOptions {
  id: InspectorId
  label: string
  icon?: string
  treeFilterPlaceholder?: string
  stateFilterPlaceholder?: string
  noSelectionText?: string
  actions?: {
    icon: string
    tooltip?: string
    action: () => void | Promise<void>
  }[]
  nodeActions?: {
    icon: string
    tooltip?: string
    action: (nodeId: string) => void | Promise<void>
  }[]
}

export interface TimelineLayerOptions {
  id: string
  label: string
  color: number
}

export interface TimelineEventOptions {
  layerId: string
  event: {
    time: number
    title: string
    subtitle?: string
    data?: unknown
    logType?: 'default' | 'warning' | 'error'
    meta?: Record<string, unknown>
    groupId?: number
  }
  all?: boolean
}

export interface MutableInspectorTreePayload {
  app?: object
  inspectorId: InspectorId
  filter?: string
  rootNodes: unknown[]
}

export interface MutableInspectorStatePayload {
  app?: object
  inspectorId: InspectorId
  nodeId: string
  state: unknown
}

export interface MutableEditStatePayload {
  app?: object
  inspectorId: InspectorId
  nodeId: string
  componentInstance?: object
  path: string[]
  type: string
  state: {
    value?: unknown
    newKey?: string | null
    remove?: boolean
    type?: string
  }
  set?: (
    object: object,
    path?: string | string[],
    value?: unknown,
    cb?: (object: Record<PropertyKey, unknown>, field: string, value: unknown) => void,
  ) => void
}

export interface VisitComponentTreePayload {
  app?: object
  componentInstance: object
  treeNode: unknown
  filter: string
}

export interface InspectComponentPayload {
  app?: object
  componentInstance: object
  instanceData: unknown
}

export interface InspectTimelineEventPayload {
  app?: object
  appId?: string
  pluginId?: PluginId
  layerId: string
  event: unknown
  all?: boolean
  data: unknown
}

export interface SetPluginSettingsPayload {
  app?: object
  pluginId: PluginId
  key: string
  newValue: unknown
  oldValue: unknown
  /** @deprecated Use `newValue`. Retained for pre-v9 adapter consumers. */
  value?: unknown
  settings: Record<string, unknown>
}

export interface DevToolsPluginAPIHooks {
  visitComponentTree: (payload: VisitComponentTreePayload) => MaybePromise<void>
  inspectComponent: (payload: InspectComponentPayload) => MaybePromise<void>
  editComponentState: (payload: MutableEditStatePayload) => MaybePromise<void>
  getInspectorTree: (payload: MutableInspectorTreePayload) => MaybePromise<void>
  getInspectorState: (payload: MutableInspectorStatePayload) => MaybePromise<void>
  editInspectorState: (payload: MutableEditStatePayload) => MaybePromise<void>
  inspectTimelineEvent: (payload: InspectTimelineEventPayload) => MaybePromise<void>
  timelineCleared: (payload: Record<string, never>) => MaybePromise<void>
  setPluginSettings: (payload: SetPluginSettingsPayload) => MaybePromise<void>
}

/**
 * Versioned capabilities of the current plugin adapter. Bump a capability's
 * version when its payload contract changes; add a new key when the adapter
 * learns a new API surface. Plugins can read this via `api.capabilities` to
 * feature-detect instead of probing individual methods.
 */
export const PLUGIN_API_CAPABILITIES: Readonly<Record<string, number>> = Object.freeze({
  'component-hooks': 1,
  'custom-actions': 1,
  'custom-inspector': 1,
  settings: 1,
  timeline: 1,
})

export interface DevToolsPluginAPI {
  readonly capabilities: Readonly<Record<string, number>>
  on: {
    [K in keyof DevToolsPluginAPIHooks]: (handler: DevToolsPluginAPIHooks[K]) => void
  }
  addInspector(options: CustomInspectorOptions): void
  sendInspectorTree(inspectorId: InspectorId): void
  sendInspectorState(inspectorId: InspectorId): void
  selectInspectorNode(inspectorId: InspectorId, nodeId: string): void
  notifyComponentUpdate(instance?: object): void
  visitComponentTree(payload: VisitComponentTreePayload): Promise<void>
  addTimelineLayer(options: TimelineLayerOptions): void
  addTimelineEvent(options: TimelineEventOptions): void
  getComponentInstances(app: object): Promise<object[]>
  getComponentBounds(instance: object): Promise<unknown>
  getComponentName(instance: object): Promise<string | undefined>
  getSettings(pluginId?: string): Record<string, unknown>
  highlightElement(instance: object): Promise<void>
  now(): number
  unhighlightElement(): Promise<void>
}

export interface PluginApiAdapter {
  descriptor: PluginDescriptor
  api: DevToolsPluginAPI
  getSettings(pluginId?: string): Record<string, unknown>
  syncSettings(): void
  updateSetting(key: string, value: unknown): Promise<void>
  clearHooks(): void
  callHook<K extends keyof DevToolsPluginAPIHooks>(
    key: K,
    payload: Parameters<DevToolsPluginAPIHooks[K]>[0],
  ): Promise<void>
}

export function createPluginApiAdapter(
  descriptor: PluginDescriptor,
  runtime: DevtoolsRuntime,
  resolvePluginSettings?: (pluginId: string) => Record<string, unknown> | undefined,
): PluginApiAdapter {
  const handlers = new Map<keyof DevToolsPluginAPIHooks, Set<Function>>()
  let settingsValues = readSettingsDefaults(descriptor.settings)

  function addHook<K extends keyof DevToolsPluginAPIHooks>(
    key: K,
    handler: DevToolsPluginAPIHooks[K],
  ) {
    const list = handlers.get(key) ?? new Set<Function>()
    list.add(handler)
    handlers.set(key, list)
  }

  const hookRegistrars: DevToolsPluginAPI['on'] = {
    visitComponentTree: (handler) => addHook('visitComponentTree', handler),
    inspectComponent: (handler) => addHook('inspectComponent', handler),
    editComponentState: (handler) => addHook('editComponentState', handler),
    getInspectorTree: (handler) => addHook('getInspectorTree', handler),
    getInspectorState: (handler) => addHook('getInspectorState', handler),
    editInspectorState: (handler) => addHook('editInspectorState', handler),
    inspectTimelineEvent: (handler) => addHook('inspectTimelineEvent', handler),
    timelineCleared: (handler) => addHook('timelineCleared', handler),
    setPluginSettings: (handler) => addHook('setPluginSettings', handler),
  }

  const api: DevToolsPluginAPI = {
    capabilities: PLUGIN_API_CAPABILITIES,
    on: createHookRegistrarProxy(descriptor.id, hookRegistrars),
    addInspector(options) {
      void runtime.command({
        type: 'inspectors:add',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), options },
      })
    },
    sendInspectorTree(inspectorId) {
      void runtime.command({
        type: 'inspectors:invalidateTree',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), inspectorId },
      })
    },
    sendInspectorState(inspectorId) {
      void runtime.command({
        type: 'inspectors:invalidateState',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), inspectorId },
      })
    },
    selectInspectorNode(inspectorId, nodeId) {
      void runtime.command({
        type: 'inspectors:selectNode',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), inspectorId, nodeId },
      })
    },
    notifyComponentUpdate(instance) {
      const componentId = instance ? runtime.registry.getComponentId(instance) : undefined
      if (!componentId) return
      void runtime.command({
        type: 'components:invalidate',
        payload: { componentId } satisfies { componentId?: ComponentId },
      })
    },
    async visitComponentTree(payload) {
      await callHook('visitComponentTree', payload)
    },
    addTimelineLayer(options) {
      void runtime.command({
        type: 'timeline:addLayer',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), options },
      })
    },
    addTimelineEvent(options) {
      void runtime.command({
        type: 'timeline:addEvent',
        payload: { pluginId: descriptor.id, app: scopedApp(descriptor), options },
      })
    },
    async getComponentInstances(app) {
      const record = runtime.registry.getAppByRef(app)
      return record ? [...record.components.values()].map((component) => component.instance) : []
    },
    async getComponentBounds(instance) {
      return await runtime.query({ type: 'components:getBounds', payload: { instance } })
    },
    async getComponentName(instance) {
      return await runtime.query({ type: 'components:getName', payload: { instance } })
    },
    getSettings(pluginId) {
      return getSettingsSnapshot(pluginId)
    },
    async highlightElement(instance) {
      await runtime.command({ type: 'components:highlight', payload: { instance } })
    },
    now() {
      return Date.now()
    },
    async unhighlightElement() {
      await runtime.command({ type: 'components:unhighlight' })
    },
  }

  function getSettingsSnapshot(pluginId?: string): Record<string, unknown> {
    if (pluginId && pluginId !== descriptor.id) return resolvePluginSettings?.(pluginId) ?? {}
    return { ...settingsValues }
  }

  function syncSettings() {
    settingsValues = readSettingsDefaults(descriptor.settings, settingsValues)
  }

  async function updateSetting(key: string, value: unknown) {
    if (!descriptor.settings || !(key in descriptor.settings)) return

    const oldValue = settingsValues[key]

    settingsValues = {
      ...settingsValues,
      [key]: value,
    }

    await callHook('setPluginSettings', {
      app: descriptor.app,
      pluginId: descriptor.id,
      key,
      newValue: value,
      oldValue,
      value,
      settings: getSettingsSnapshot(),
    })
  }

  async function callHook<K extends keyof DevToolsPluginAPIHooks>(
    key: K,
    payload: Parameters<DevToolsPluginAPIHooks[K]>[0],
  ) {
    const list = handlers.get(key)
    if (!list) return
    await Promise.all(
      [...list].map(async (handler) => {
        try {
          await handler(payload)
        } catch (error) {
          reportPluginError(descriptor.id, `"${key}" hook`, error)
        }
      }),
    )
  }

  const adapter: PluginApiAdapter = {
    descriptor,
    api,
    getSettings: getSettingsSnapshot,
    syncSettings,
    updateSetting,
    clearHooks() {
      handlers.clear()
    },
    callHook,
  }

  return adapter
}

function scopedApp(descriptor: PluginDescriptor): object | undefined {
  return descriptor.disableAppScope ? undefined : descriptor.app
}

export function reportPluginError(pluginId: PluginId, context: string, error: unknown): void {
  console.error(`[vue-devtools] plugin "${pluginId}" ${context} failed`, error)
}

// A hook this adapter does not know must degrade to a diagnosable no-op: the
// plugin's remaining setup still runs, and the gap is reported once instead of
// crashing with "not a function".
function createHookRegistrarProxy(
  pluginId: PluginId,
  registrars: DevToolsPluginAPI['on'],
): DevToolsPluginAPI['on'] {
  const warnedHooks = new Set<string>()

  return new Proxy(registrars, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || prop in target || prop === 'then' || prop === 'toJSON')
        return Reflect.get(target, prop, receiver)

      return () => {
        if (warnedHooks.has(prop)) return
        warnedHooks.add(prop)
        console.warn(
          `[vue-devtools] plugin "${pluginId}" registered unsupported hook "${prop}"; ` +
            `supported capabilities: ${Object.keys(PLUGIN_API_CAPABILITIES).join(', ')}`,
        )
      }
    },
  })
}

function readSettingsDefaults(
  settings: PluginDescriptor['settings'] | undefined,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!settings) return result

  for (const [key, value] of Object.entries(settings)) {
    result[key] = key in current ? current[key] : value.defaultValue
  }

  return result
}

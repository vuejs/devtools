import { ValueHandleRegistry } from '../codec'
import type { AppsSnapshotMessage } from '../protocol'
import type { RuntimeRequests } from '../protocol/requests'
import { resolveRuntimeBudget, type RuntimeBudget, type RuntimeBudgetInput } from './budget'
import {
  cancelComponentInspection,
  type ComponentInspectorDockController,
  setComponentInspectorDockController,
} from './component-inspector'
import { ComponentTreeStore } from './components'
import { createRuntimeEventLog, type RuntimeEventLog } from './events'
import { registerComponentHandlers } from './handlers/components'
import { registerInspectorHandlers } from './handlers/inspectors'
import { registerRouterHandlers } from './handlers/router'
import { registerTimelineHandlers } from './handlers/timeline'
import { RuntimeInspectorStore } from './inspectors'
import { createRuntimePerformanceMonitor, type RuntimePerformanceMonitor } from './performance'
import { RuntimeRegistry } from './registry'
import { createRuntimeScheduler, type RuntimeScheduler } from './scheduler'
import { ComponentStateCollector } from './state'
import { createRuntimeTimeline, type RuntimeTimelineController } from './timeline'
import type {
  MaybePromise,
  RuntimeCommand,
  RuntimeCommandResult,
  RuntimeDomainEvent,
  RuntimeDomainEventType,
  RuntimeEvent,
  RuntimeEventHandler,
  RuntimeQuery,
} from './types'
import { createComponentUpdateHighlight } from './update-highlight'

export type RuntimeQueryHandler<T = unknown> = (
  query: RuntimeQuery,
  runtime: DevtoolsRuntime,
) => MaybePromise<T>

export type RuntimeCommandHandler<Payload = unknown> = (
  command: RuntimeCommand<Payload>,
  runtime: DevtoolsRuntime,
) => MaybePromise<RuntimeCommandResult | void>

export interface DevtoolsRuntime extends RuntimeRequests {
  readonly budget: RuntimeBudget
  readonly components: ComponentTreeStore
  readonly componentState: ComponentStateCollector
  readonly events: RuntimeEventLog
  readonly inspectors: RuntimeInspectorStore
  readonly performance: RuntimePerformanceMonitor
  readonly registry: RuntimeRegistry
  readonly scheduler: RuntimeScheduler
  isCollectionActive(): boolean
  setCollectionActive(active: boolean, attachedClients?: number): void
  dispatch(event: RuntimeEvent): void
  registerQuery<T>(type: string, handler: RuntimeQueryHandler<T>): () => void
  registerCommand<Payload = unknown>(
    type: string,
    handler: RuntimeCommandHandler<Payload>,
  ): () => void
  setPluginHookRunner(
    runner: ((key: string, payload: unknown, pluginId?: string) => Promise<void>) | undefined,
  ): void
  callPluginHook(key: string, payload: unknown, pluginId?: string): Promise<void>
  subscribe(type: '*', handler: RuntimeEventHandler): () => void
  subscribe<Type extends RuntimeDomainEventType>(
    type: Type,
    handler: RuntimeEventHandler<Extract<RuntimeDomainEvent, { type: Type }>>,
  ): () => void
  dispose(): void
}

export interface CreateDevtoolsRuntimeOptions {
  budget?: RuntimeBudgetInput
  collectionInitiallyActive?: boolean
  componentInspectorDockController?: ComponentInspectorDockController
}

export function createDevtoolsRuntime(options: CreateDevtoolsRuntimeOptions = {}): DevtoolsRuntime {
  const queryHandlers = new Map<string, RuntimeQueryHandler>()
  const commandHandlers = new Map<string, RuntimeCommandHandler>()
  const events = createRuntimeEventLog()
  const registry = new RuntimeRegistry()
  const budget = resolveRuntimeBudget(options.budget)
  const components = new ComponentTreeStore(registry, budget.components)
  const componentState = new ComponentStateCollector(registry, budget)
  const inspectors = new RuntimeInspectorStore()
  const performance = createRuntimePerformanceMonitor(options.collectionInitiallyActive ?? true)
  const timelineValueHandles = new ValueHandleRegistry({ maxHandles: budget.state.maxHandles })
  const scheduler = createRuntimeScheduler()
  let timeline: RuntimeTimelineController | undefined
  let highlight: ReturnType<typeof createComponentUpdateHighlight> | undefined
  let pluginHookRunner:
    | ((key: string, payload: unknown, pluginId?: string) => Promise<void>)
    | undefined
  let collectionActive = options.collectionInitiallyActive ?? true
  let attachedClients = 0

  function processEvent(event: RuntimeEvent): void {
    const result = registry.apply(event)
    const componentId = result && 'appId' in result ? result.id : undefined
    const patchBatch =
      event.type === 'app:init' && result && 'components' in result
        ? components.syncApp(result)
        : event.type === 'component:add' ||
            event.type === 'component:update' ||
            event.type === 'component:remove'
          ? components.apply(event, result && 'appId' in result ? result : undefined)
          : undefined

    events.dispatch(event)

    switch (event.type) {
      case 'app:init':
        events.dispatch({
          type: 'apps:changed',
          time: event.time,
          appId: result && 'components' in result ? result.id : undefined,
        })
        break
      case 'app:unmount': {
        cancelComponentInspection()
        const appId = result && 'components' in result ? result.id : undefined
        if (appId) components.removeApp(appId)
        for (const removed of inspectors.removeByApp(event.app)) {
          events.dispatch({
            type: 'inspectors:changed',
            time: event.time,
            appId,
            inspectorId: removed.options.id,
            pluginId: removed.pluginId,
            reason: 'remove',
          })
        }
        events.dispatch({ type: 'apps:changed', time: event.time })
        break
      }
      case 'component:add':
      case 'component:update':
      case 'component:remove':
        if (patchBatch) {
          events.dispatch({
            type: 'components:treePatched',
            time: event.time,
            appId: event.appId,
            version: patchBatch.version,
            patches: patchBatch.patches,
          })
        }
        if (componentId) {
          events.dispatch({
            type: 'components:stateInvalidated',
            time: event.time,
            appId: event.appId,
            componentId,
            version: componentState.invalidate(componentId),
            reason: event.type.split(':')[1] as 'add' | 'update' | 'remove',
          })
        }
        events.dispatch({
          type: 'components:changed',
          time: event.time,
          appId: event.appId,
          componentId,
          reason: event.type.split(':')[1] as 'add' | 'update' | 'remove',
        })
        break
    }
  }

  async function query<T>(request: RuntimeQuery): Promise<T> {
    const handler = queryHandlers.get(request.type)
    if (!handler) throw new Error(`Unknown runtime query: ${request.type}`)
    return (await handler(request, runtime)) as T
  }

  async function command(request: RuntimeCommand): Promise<RuntimeCommandResult> {
    const handler = commandHandlers.get(request.type)
    if (!handler) return { status: 0, error: new Error(`Unknown runtime command: ${request.type}`) }
    return (await handler(request, runtime)) ?? { status: 1 }
  }

  const runtime: DevtoolsRuntime = {
    budget,
    components,
    componentState,
    events,
    inspectors,
    performance,
    registry,
    scheduler,
    dispatch(event) {
      performance.recordReceived()
      if (!collectionActive && !isLowOverheadEvent(event)) {
        performance.recordDropped()
        return
      }

      if (event.type === 'component:update') {
        const componentId = registry.getComponentId(event.instance)
        // Collapsed subtrees are read from live Vue instances when expanded.
        // Do not materialize their metadata or queue work for every render.
        if (
          !componentId ||
          (!components.isVisible(event.appId, componentId) &&
            !componentState.hasSnapshot(componentId))
        ) {
          events.dispatch(event)
          return
        }
        const key = `component:update:${event.appId}:${componentId}`
        const coalesced = scheduler.schedule(
          key,
          () => processEvent(event),
          budget.components.updateDebounceMs,
        )
        if (coalesced) performance.recordCoalesced()
        return
      }

      processEvent(event)
    },
    isCollectionActive() {
      return collectionActive
    },
    setCollectionActive(active, clientCount = attachedClients) {
      collectionActive = active
      attachedClients = clientCount
      if (!active && clientCount === 0) {
        cancelComponentInspection()
        highlight?.clear()
        components.resetTrackingCache()
        registry.resetComponentTracking()
        componentState.clear()
        timelineValueHandles.clear()
      }
      performance.setCollectionState(active, attachedClients)
    },
    query: query as RuntimeRequests['query'],
    command,
    queryCustom: query,
    commandCustom: command,
    registerQuery(type, handler) {
      queryHandlers.set(type, handler as RuntimeQueryHandler)
      return () => {
        queryHandlers.delete(type)
      }
    },
    registerCommand(type, handler) {
      commandHandlers.set(type, handler as RuntimeCommandHandler)
      return () => {
        commandHandlers.delete(type)
      }
    },
    setPluginHookRunner(runner) {
      pluginHookRunner = runner
    },
    async callPluginHook(key, payload, pluginId) {
      await pluginHookRunner?.(key, payload, pluginId)
    },
    subscribe(type: RuntimeDomainEventType | '*', handler: RuntimeEventHandler) {
      return events.subscribe(type as never, handler as never)
    },
    dispose() {
      components.resetTrackingCache()
      highlight?.dispose()
      cancelComponentInspection()
      setComponentInspectorDockController(undefined)
      pluginHookRunner = undefined
      timeline?.dispose()
      timeline = undefined
      queryHandlers.clear()
      commandHandlers.clear()
      scheduler.clear()
      componentState.clear()
      timelineValueHandles.clear()
      inspectors.clear()
      events.clear()
    },
  }

  setComponentInspectorDockController(options.componentInspectorDockController)
  timeline = createRuntimeTimeline(runtime, timelineValueHandles)
  highlight = createComponentUpdateHighlight(
    runtime as Parameters<typeof createComponentUpdateHighlight>[0],
  )
  runtime.registerQuery<AppsSnapshotMessage>('apps:snapshot', () => ({
    apps: runtime.registry.listApps().map((record) => runtime.registry.toAppSnapshot(record)),
  }))
  runtime.registerQuery('runtime:health', () => ({
    status: 'ready',
    performance: runtime.performance.snapshot(),
  }))
  registerComponentHandlers(runtime, timelineValueHandles, highlight!)
  registerInspectorHandlers(runtime)
  registerRouterHandlers(runtime)
  registerTimelineHandlers(runtime, timelineValueHandles, timeline)
  return runtime
}

function isLowOverheadEvent(event: RuntimeEvent): boolean {
  return event.type === 'app:init' || event.type === 'app:unmount' || event.type === 'plugin:setup'
}

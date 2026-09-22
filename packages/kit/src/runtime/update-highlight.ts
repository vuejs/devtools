import type { ComponentTreePatchBatch } from './components'
import type { ComponentRecord } from './registry'
import type { AppId, ComponentId, RuntimeEvent } from './types'
import { getComponentRecordBounds, isComponentInspectionActive } from './component-inspector'

type PerfEvent = Extract<RuntimeEvent, { type: 'perf:start' | 'perf:end' }>

interface UpdateHighlightRuntime {
  budget: { components: { updateDebounceMs: number } }
  components: {
    includePerfMetrics: boolean
    touch(record: ComponentRecord): ComponentTreePatchBatch | undefined
  }
  registry: {
    getComponentId(instance: object): ComponentId | undefined
    getComponent(componentId: ComponentId, appId?: AppId): ComponentRecord | undefined
  }
  scheduler: {
    schedule(key: string, work: () => void, delay?: number): boolean
  }
  events: {
    dispatch(event: object): void
  }
  subscribe(type: string, handler: (event: PerfEvent) => void): () => void
}

export const UPDATE_FLASH_CAP = 32
export const UPDATE_FLASH_MS = 350
export const UPDATE_FLASH_CONTAINER_ID = '__vue-devtools-update-flash__'

const FLASH_PHASE = 'patch'
const DURATION_PHASES = new Set(['mount', 'patch'])

export interface ComponentUpdateHighlight {
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  clear(): void
  dispose(): void
}

export function createComponentUpdateHighlight(
  runtime: UpdateHighlightRuntime,
): ComponentUpdateHighlight {
  let enabled = false
  const pendingStarts = new Map<string, number>()
  const pendingFlashes: ComponentRecord[] = []
  const hideTimers = new Set<ReturnType<typeof setTimeout>>()
  let flushScheduled = false
  let disposed = false

  const unsubscribeStart = runtime.subscribe('perf:start', (event) => {
    if (!enabled || disposed) return
    pendingStarts.set(
      getPerfKey(event.appId, runtime.registry.getComponentId(event.instance), event.phase),
      event.timestamp,
    )
  })

  const unsubscribeEnd = runtime.subscribe('perf:end', (event) => {
    if (!enabled || disposed) return

    const key = getPerfKey(
      event.appId,
      runtime.registry.getComponentId(event.instance),
      event.phase,
    )
    const started = pendingStarts.get(key)
    pendingStarts.delete(key)
    if (started == null) return

    const duration = Math.max(0, event.timestamp - started)
    const componentId = runtime.registry.getComponentId(event.instance)
    const record = componentId ? runtime.registry.getComponent(componentId, event.appId) : undefined
    if (!record) return

    if (DURATION_PHASES.has(event.phase)) {
      if (event.phase === 'mount') record.lastMountMs = duration
      else record.lastUpdateMs = duration
      scheduleDurationPatch(runtime, record)
    }

    if (event.phase === FLASH_PHASE) enqueueFlash(record)
  })

  return {
    isEnabled() {
      return enabled
    },
    setEnabled(next) {
      enabled = next
      runtime.components.includePerfMetrics = next
      if (!next) {
        pendingStarts.clear()
        clearFlash()
      }
    },
    clear: clearFlash,
    dispose() {
      disposed = true
      enabled = false
      runtime.components.includePerfMetrics = false
      unsubscribeStart()
      unsubscribeEnd()
      pendingStarts.clear()
      clearFlash()
    },
  }

  function enqueueFlash(record: ComponentRecord) {
    if (isComponentInspectionActive()) return
    if (pendingFlashes.length >= UPDATE_FLASH_CAP) pendingFlashes.shift()
    pendingFlashes.push(record)
    if (flushScheduled) return
    flushScheduled = true
    scheduleFrame(() => {
      flushScheduled = false
      flushFlashes()
    })
  }

  function flushFlashes() {
    if (!enabled || disposed || typeof document === 'undefined') {
      pendingFlashes.length = 0
      return
    }

    const records = pendingFlashes.splice(0, pendingFlashes.length)
    const container = getOrCreateFlashContainer(document)
    if (!container) return

    for (const record of records) {
      const bounds = getComponentRecordBounds(record)
      if (!bounds || (!bounds.width && !bounds.height)) continue

      const rect = document.createElement('div')
      Object.assign(rect.style, {
        position: 'fixed',
        left: `${Math.round(bounds.left)}px`,
        top: `${Math.round(bounds.top)}px`,
        width: `${Math.round(bounds.width)}px`,
        height: `${Math.round(bounds.height)}px`,
        backgroundColor: '#42b88333',
        border: '1px solid #42b88380',
        borderRadius: '4px',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      } satisfies Partial<CSSStyleDeclaration>)
      container.append(rect)

      const timer = setTimeout(() => {
        hideTimers.delete(timer)
        rect.remove()
        if (!container.childElementCount) container.remove()
      }, UPDATE_FLASH_MS)
      hideTimers.add(timer)
    }
  }

  function clearFlash() {
    pendingFlashes.length = 0
    for (const timer of hideTimers) clearTimeout(timer)
    hideTimers.clear()
    if (typeof document !== 'undefined')
      document.getElementById(UPDATE_FLASH_CONTAINER_ID)?.remove()
  }
}

function scheduleDurationPatch(runtime: UpdateHighlightRuntime, record: ComponentRecord) {
  runtime.scheduler.schedule(
    `perf:${record.appId}:${record.id}`,
    () => {
      const batch = runtime.components.touch(record)
      if (!batch) return
      runtime.events.dispatch({
        type: 'components:treePatched',
        time: Date.now(),
        appId: batch.appId,
        version: batch.version,
        patches: batch.patches,
      })
    },
    runtime.budget.components.updateDebounceMs,
  )
}

function getPerfKey(appId: string, componentId: string | undefined, phase: string): string {
  return `${appId}:${phase}:${componentId ?? 'unknown'}`
}

function scheduleFrame(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback)
    return
  }
  setTimeout(callback, 0)
}

function getOrCreateFlashContainer(document: Document): HTMLElement | undefined {
  const existing = document.getElementById(UPDATE_FLASH_CONTAINER_ID)
  if (existing) return existing
  if (!document.body) return

  const container = document.createElement('div')
  container.id = UPDATE_FLASH_CONTAINER_ID
  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483630',
    pointerEvents: 'none',
    overflow: 'visible',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.append(container)
  return container
}

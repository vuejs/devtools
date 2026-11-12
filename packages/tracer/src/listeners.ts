import type { Ref, ShallowRef } from 'vue'
import type { ElementTraceInfo } from './client'
import { customRef, shallowRef } from 'vue'
import { findTraceAtPointer, findTraceFromElement, getInternalStore } from './client'

export * from './client'

export interface Events {
  hover: (info: ElementTraceInfo | undefined, event: MouseEvent | PointerEvent) => void
  click: (info: ElementTraceInfo, event: MouseEvent | PointerEvent) => void
  enabled: () => void
  disabled: () => void
}

// Match the nanoevents API without adding a runtime dependency.
interface Emitter {
  events: { [K in keyof Events]?: Events[K][] }
  on: <K extends keyof Events>(event: K, callback: Events[K]) => () => void
  emit: <K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) => void
}
interface Listeners {
  events: Emitter
  isEnabled: Ref<boolean>
  lastMatchedElement: ShallowRef<ElementTraceInfo | undefined>
}

function createListeners(): Listeners {
  const events: Emitter = {
    events: {},
    on(event, callback) {
      const callbacks = (events.events[event] ||= []) as (typeof callback)[]
      callbacks.push(callback)
      return () => {
        events.events[event] = (events.events[event] || []).filter(
          (item) => item !== callback,
        ) as never
      }
    },
    emit(event, ...args) {
      for (const callback of (events.events[event] || []).slice()) {
        ;(callback as (...values: typeof args) => void)(...args)
      }
    },
  }
  const lastMatchedElement = shallowRef<ElementTraceInfo>()
  let enabled = false

  function find(event: MouseEvent | PointerEvent): ElementTraceInfo | undefined {
    const path = event.composedPath()
    if (
      path.some(
        (target) =>
          target instanceof Element &&
          (target.localName === 'devframes-dock-embedded' ||
            target.hasAttribute('data-v-inspector-ignore')),
      )
    )
      return
    // The pointer stack is the upstream headless API's source of truth.
    const match = findTraceAtPointer({ x: event.clientX, y: event.clientY })
    if (match) return match
    // Also handle programmatic and shadow-retargeted events without a pointer stack.
    const target = path.find((item): item is Element => item instanceof Element)
    for (let el = target; el; el = el.parentElement ?? undefined) {
      const info = findTraceFromElement(el)
      if (info) return info
    }
  }
  function hover(event: PointerEvent) {
    const result = find(event)
    if (result?.el === lastMatchedElement.value?.el) return
    lastMatchedElement.value = result
    events.emit('hover', result, event)
  }
  function click(event: MouseEvent) {
    const result = find(event)
    if (!result) return
    events.emit('click', result, event)
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const isEnabled = customRef<boolean>((track, trigger) => ({
    get() {
      track()
      return enabled
    },
    set(value) {
      if (enabled === value) return
      enabled = value
      if (typeof document !== 'undefined') {
        if (value) {
          document.addEventListener('pointermove', hover, true)
          document.addEventListener('click', click, true)
        } else {
          document.removeEventListener('pointermove', hover, true)
          document.removeEventListener('click', click, true)
          lastMatchedElement.value = undefined
        }
      }
      trigger()
      events.emit(value ? 'enabled' : 'disabled')
    },
  }))
  return { events, isEnabled, lastMatchedElement }
}

const store = getInternalStore() as ReturnType<typeof getInternalStore> & { listeners?: Listeners }
const listeners = (store.listeners ||= createListeners())
export const { events, isEnabled, lastMatchedElement } = listeners

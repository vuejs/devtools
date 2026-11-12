/// <reference types="vite/client" />
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import type {} from '@vitejs/devtools'
import type { VueTracerOptions } from './options'
import { events, getInternalStore, isEnabled, state } from './overlay'

interface Sessions {
  bindings: WeakMap<object, () => void>
  stopActive?: () => void
}
const store = getInternalStore() as ReturnType<typeof getInternalStore> & { devtools?: Sessions }
const sessions = (store.devtools ||= { bindings: new WeakMap() })
const disposers = new Set<() => void>()

export function createClientScriptSetup(options: Pick<VueTracerOptions, 'onPick'>) {
  return function setupTracerDevTools(ctx: DockClientScriptContext): () => void {
    const dockEvents = ctx.current.events
    sessions.bindings.get(dockEvents)?.()
    let offClick: (() => void) | undefined
    const stop = () => {
      offClick?.()
      offClick = undefined
      if (sessions.stopActive !== stop) return
      sessions.stopActive = undefined
      if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown, true)
      isEnabled.value = false
      state.isVisible = false
    }
    const finish = () => {
      stop()
      void ctx.docks.setActionActive(ctx.current.entryMeta.id, false).catch((error) => {
        console.warn('[vue-devtools-tracer] Failed to stop the element picker', error)
      })
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish()
    }
    const activate = () => {
      sessions.stopActive?.()
      sessions.stopActive = stop
      if (typeof window !== 'undefined') window.focus()
      offClick = events.on('click', (info) => {
        finish()
        if (options.onPick === 'none') return
        void ctx.rpc
          .call('vite:core:open-in-editor', `${info.pos[0]}:${info.pos[1]}:${info.pos[2] + 1}`)
          .catch((error) => {
            console.warn('[vue-devtools-tracer] Failed to open source in the editor', error)
          })
      })
      if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown, true)
      isEnabled.value = true
    }
    const offActivate = dockEvents.on('entry:activated', activate)
    const offDeactivate = dockEvents.on('entry:deactivated', stop)
    const dispose = () => {
      offActivate()
      offDeactivate()
      stop()
      if (sessions.bindings.get(dockEvents) === dispose) sessions.bindings.delete(dockEvents)
      disposers.delete(dispose)
    }
    sessions.bindings.set(dockEvents, dispose)
    disposers.add(dispose)
    if (ctx.current.isActive) activate()
    return dispose
  }
}

export default createClientScriptSetup({})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const dispose of disposers) dispose()
  })
}

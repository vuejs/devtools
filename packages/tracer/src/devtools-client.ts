/// <reference types="vite/client" />
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import type {} from '@vitejs/devtools'
import { createTracerOverlay } from './overlay'

const disposers = new Set<() => void>()

export default function setupTracerDevTools(ctx: DockClientScriptContext): () => void {
  const finish = () => {
    void ctx.docks.setActionActive(ctx.current.entryMeta.id, false).catch((error) => {
      console.warn('[vue-devtools-tracer] Failed to stop the element picker', error)
    })
  }
  const overlay = createTracerOverlay({
    onCancel: finish,
    onPick(position) {
      finish()
      void ctx.rpc
        .call('vite:core:open-in-editor', `${position[0]}:${position[1]}:${position[2] + 1}`)
        .catch((error) => {
          console.warn('[vue-devtools-tracer] Failed to open source in the editor', error)
        })
    },
  })
  const activate = () => {
    if (typeof window !== 'undefined') window.focus()
    overlay.enable()
  }
  const offActivate = ctx.current.events.on('entry:activated', activate)
  const offDeactivate = ctx.current.events.on('entry:deactivated', overlay.dispose)
  const dispose = () => {
    offActivate()
    offDeactivate()
    overlay.dispose()
    disposers.delete(dispose)
  }
  disposers.add(dispose)
  if (ctx.current.isActive) activate()
  return dispose
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const dispose of disposers) dispose()
  })
}

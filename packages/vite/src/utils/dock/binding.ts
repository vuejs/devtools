import type { DevToolsClientContext, DockClientScriptContext } from '@vitejs/devtools-kit/client'
import type { ComponentInspectorDockRestore, DevtoolsKit } from '@vue/devtools-kit'
import { closeDockPanelForComponentInspection } from '../../component-inspector'

export interface VueDevToolsDockBinding {
  closeForComponentInspection(): Promise<ComponentInspectorDockRestore | undefined>
  dispose(): void
}

export function createVueDevToolsDockBinding(
  context: DevToolsClientContext | DockClientScriptContext,
  runtime: DevtoolsKit['runtime'] | undefined,
): VueDevToolsDockBinding {
  let componentInspectionOwnsDock = false
  const disposeDockDeactivation = isDockClientScriptContext(context)
    ? context.current.events.on('entry:deactivated', () => {
        if (componentInspectionOwnsDock) return
        void runtime?.command({ type: 'components:cancelInspect' })
      })
    : undefined

  return {
    async closeForComponentInspection() {
      componentInspectionOwnsDock = true

      try {
        const restore = await closeDockPanelForComponentInspection(context)
        if (!restore) {
          componentInspectionOwnsDock = false
          return
        }

        return async () => {
          try {
            await restore()
          } finally {
            componentInspectionOwnsDock = false
          }
        }
      } catch (error) {
        componentInspectionOwnsDock = false
        throw error
      }
    },
    dispose() {
      disposeDockDeactivation?.()
      componentInspectionOwnsDock = false
    },
  }
}

function isDockClientScriptContext(
  context: DevToolsClientContext | DockClientScriptContext,
): context is DockClientScriptContext {
  return 'current' in context
}

import type { ComponentInspectorDockRestore } from '@vue/devtools-kit'

export interface ComponentInspectorDockContext {
  docks: {
    selectedId?: string | null
    switchEntry(id?: string | null): unknown
  }
  panel: {
    session?: {
      open: boolean
    }
  }
}

export async function closeDockPanelForComponentInspection(
  context: ComponentInspectorDockContext | undefined,
): Promise<ComponentInspectorDockRestore | undefined> {
  const session = context?.panel.session
  const selectedId = context?.docks.selectedId
  const wasOpen = session?.open === true

  if (!context || (!selectedId && !wasOpen)) return

  if (selectedId) await context.docks.switchEntry(null)
  else if (session) session.open = false

  return async () => {
    if (selectedId) {
      await context.docks.switchEntry(selectedId)
      return
    }

    if (session && wasOpen) session.open = true
  }
}

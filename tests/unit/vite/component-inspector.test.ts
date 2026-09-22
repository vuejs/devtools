import type { ComponentInspectorDockContext } from '../../../packages/vite/src/component-inspector'
import { describe, expect, it, vi } from 'vitest'
import { closeDockPanelForComponentInspection } from '../../../packages/vite/src/component-inspector'

describe('Vite component inspector dock lifecycle', () => {
  it('closes and restores the selected dock', async () => {
    const context = createContext({ selectedId: 'vue-devtools' })

    const restore = await closeDockPanelForComponentInspection(context)
    expect(context.switchEntry).toHaveBeenCalledWith(null)

    await restore?.()
    expect(context.switchEntry).toHaveBeenLastCalledWith('vue-devtools')
  })

  it('closes and restores an open floating panel', async () => {
    const context = createContext({ open: true })

    const restore = await closeDockPanelForComponentInspection(context)
    expect(context.panel.session?.open).toBe(false)

    await restore?.()
    expect(context.panel.session?.open).toBe(true)
  })

  it('does not open a panel that was already closed', async () => {
    const context = createContext({ open: false })

    await expect(closeDockPanelForComponentInspection(context)).resolves.toBeUndefined()
    expect(context.switchEntry).not.toHaveBeenCalled()
    expect(context.panel.session?.open).toBe(false)
  })

  it('is a no-op without a dock context', async () => {
    await expect(closeDockPanelForComponentInspection(undefined)).resolves.toBeUndefined()
  })
})

interface TestDockContext extends ComponentInspectorDockContext {
  switchEntry: ReturnType<typeof vi.fn>
}

function createContext(options: { open?: boolean; selectedId?: string } = {}): TestDockContext {
  const switchEntry = vi.fn()
  return {
    docks: {
      selectedId: options.selectedId,
      switchEntry,
    },
    panel: {
      session: {
        open: options.open ?? false,
      },
    },
    switchEntry,
  }
}

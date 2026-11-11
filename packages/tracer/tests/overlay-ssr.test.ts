import { expect, it, vi } from 'vitest'
import { createTracerOverlay } from '../src/overlay'

it('can be imported, enabled, and disposed without a DOM', () => {
  expect(typeof document).toBe('undefined')
  const overlay = createTracerOverlay({ onPick: vi.fn(), onCancel: vi.fn() })
  expect(() => overlay.enable()).not.toThrow()
  expect(() => overlay.dispose()).not.toThrow()
})

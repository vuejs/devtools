// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import type { DevtoolsHookTarget } from '../../../packages/kit/src/hook'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'

describe('Timeline listener ownership', () => {
  const kits: DevtoolsKit[] = []

  afterEach(async () => {
    await Promise.all(kits.map((kit) => Promise.resolve(kit.dispose())))
    kits.splice(0, kits.length)
  })

  it('disposes the previous owner before reconnecting and records keyboard events once', () => {
    const target = window as Window & DevtoolsHookTarget
    const first = createDevtoolsKit({
      clientName: 'fixture-owner',
      target: { name: 'Fixture' },
      hook: { target },
    })
    kits.push(first)
    first.install()
    const staleDispatch = vi.spyOn(first.runtime, 'dispatch')

    const second = createDevtoolsKit({
      clientName: 'fixture-owner',
      target: { name: 'Fixture' },
      hook: { target },
    })
    kits.push(second)
    second.install()
    second.runtime.setCollectionActive(true, 1)
    const events: string[] = []
    second.runtime.subscribe('timeline:eventAdded', (event) => {
      if (event.layerId === 'keyboard') events.push(event.title)
    })

    target.__VUE_DEVTOOLS_GLOBAL_HOOK__?.emit('app:unmount', {})
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    window.dispatchEvent(new KeyboardEvent('keypress', { key: 'a' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))

    expect(staleDispatch).not.toHaveBeenCalled()
    expect(events).toEqual(['a', 'a', 'a'])
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'
import { setupDevToolsPlugin } from '../../../packages/kit/src/plugin'
import { createComponentTreeFixture } from '../../fixtures'

const kits: DevtoolsKit[] = []

afterEach(async () => {
  for (const kit of kits.splice(0)) await kit.dispose()
})

function createKit(): DevtoolsKit {
  const kit = createDevtoolsKit({ target: { name: 'Lifecycle Test' }, hook: { install: false } })
  kit.install()
  kits.push(kit)
  return kit
}

it('does not reinstall a disposed kit', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const kit = createKit()
  await kit.dispose()

  kit.install()

  expect(warn).toHaveBeenCalledOnce()
  expect(kit.plugins.adapters.size).toBe(0)
})

it('does not replay plugin setups for an unmounted app into a later kit', async () => {
  const first = createKit()
  const fixture = createComponentTreeFixture(1)
  first.runtime.dispatch({
    type: 'app:init',
    app: fixture.app,
    time: 1,
    version: '3.5.0',
    vueTypes: {},
  })
  const setup = vi.fn()
  setupDevToolsPlugin({ id: 'plugin:replay', app: fixture.app }, setup)
  await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce())

  first.runtime.dispatch({ type: 'app:unmount', app: fixture.app, time: 2 })
  await first.dispose()
  createKit()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(setup).toHaveBeenCalledOnce()
})

it('still replays plugin setups for a mounted app into a later kit', async () => {
  const first = createKit()
  const fixture = createComponentTreeFixture(1)
  first.runtime.dispatch({
    type: 'app:init',
    app: fixture.app,
    time: 1,
    version: '3.5.0',
    vueTypes: {},
  })
  const setup = vi.fn()
  setupDevToolsPlugin({ id: 'plugin:kept', app: fixture.app }, setup)
  await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce())

  await first.dispose()
  createKit()
  await vi.waitFor(() => expect(setup).toHaveBeenCalledTimes(2))
})

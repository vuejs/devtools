// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { createDevtoolsKit } from '../../kit/src/kit'
import type { DevtoolsKit } from '../../kit/src/kit'
import { createComponentTreeFixture } from '../../../tests/fixtures/runtime'

let kit: DevtoolsKit | undefined
afterEach(async () => {
  await kit?.dispose()
  kit = undefined
})

async function setup() {
  kit = createDevtoolsKit({
    target: { name: 'search' },
    hook: { install: false },
    budget: { components: { maxInitialDepth: 1 } },
  })
  kit.install()
  const fixture = createComponentTreeFixture(30, { branching: 2 })
  kit.runtime.dispatch({
    type: 'app:init',
    app: fixture.app,
    time: 1,
    version: '3.5.0',
    vueTypes: {},
  })
  return kit
}

it('finds deep components outside the initial tree by name', async () => {
  const runtime = (await setup()).runtime
  const initial = await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
  expect(initial.nodes.some((node) => node.name === 'FixtureComponent27')).toBe(false)

  const found = await runtime.query({
    type: 'components:search',
    appId: 'app:0',
    payload: { filter: 'FixtureComponent27' },
  })
  expect(found.nodes.map((node) => node.name)).toEqual(['FixtureComponent27'])
})

it('caps search results and matches source files case-insensitively', async () => {
  const runtime = (await setup()).runtime
  const byFile = await runtime.query({
    type: 'components:search',
    appId: 'app:0',
    payload: { filter: 'fixturecomponent2' },
  })
  expect(byFile.nodes.length).toBe(11)
  const none = await runtime.query({
    type: 'components:search',
    appId: 'app:0',
    payload: { filter: 'no-such-thing' },
  })
  expect(none.nodes).toEqual([])
})

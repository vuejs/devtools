// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createDevtoolsKit, type DevtoolsKit } from '../../../packages/kit/src/kit'
import type { DevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import { createComponentTreeFixture } from '../../fixtures'

const transport = vi.hoisted(() => ({ client: undefined as DevtoolsRpcClient | undefined }))
vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => transport.client,
}))
import {
  startDevtoolsClient,
  stopDevtoolsClient,
  useDevtoolsClient,
} from '../../../packages/client/src/composables/devtools-client'

let kit: DevtoolsKit | undefined
afterEach(async () => {
  stopDevtoolsClient()
  await kit?.dispose()
})

it('refreshes async plugin discovery after the first snapshot without applying early tree patches', async () => {
  kit = createDevtoolsKit({ target: { name: 'activation-refresh' }, hook: { install: false } })
  const runtime = kit.runtime
  const { app } = createComponentTreeFixture(1)
  runtime.dispatch({ type: 'app:init', app, time: 1, version: '3.5.0', vueTypes: {} })
  let releaseSetup!: () => void
  let releaseSnapshot!: () => void
  const setupReady = new Promise<void>((resolve) => {
    releaseSetup = resolve
  })
  const snapshotReady = new Promise<void>((resolve) => {
    releaseSnapshot = resolve
  })
  await kit.plugins.register({ id: 'async-discovery', app }, async (api) => {
    await setupReady
    api.addInspector({ id: 'async-inspector', label: 'Async inspector' })
    api.addTimelineLayer({ id: 'async-layer', label: 'Async layer', color: 1 })
  })
  let reads = 0
  transport.client = {
    query: async (request) => {
      if (request.type === 'components:treeSnapshot' && ++reads === 1) await snapshotReady
      return runtime.query(request)
    },
    queryCustom: (request) => runtime.queryCustom(request),
    command: (request) => runtime.command(request),
    commandCustom: (request) => runtime.commandCustom(request),
    onEvent: (handler) =>
      runtime.subscribe('*', (event) => {
        if (
          event.type === 'apps:changed' ||
          event.type === 'inspectors:changed' ||
          event.type === 'timeline:layerAdded' ||
          event.type === 'components:treePatched'
        )
          handler(event)
      }),
    dispose() {},
  }
  runtime.setCollectionActive(true, 1)
  startDevtoolsClient()
  await vi.waitFor(() => expect(reads).toBe(1))
  const client = useDevtoolsClient()
  releaseSetup()
  await kit.plugins.activate()
  runtime.events.dispatch({
    type: 'components:treePatched',
    time: 2,
    appId: 'app:0',
    version: 2,
    patches: [
      {
        op: 'insert',
        node: { id: 'early-patch', appId: 'app:0', name: 'Must be ignored', updatedAt: 2 },
      },
    ],
  })
  expect(client.components.value.some((node) => node.id === 'early-patch')).toBe(false)
  releaseSnapshot()
  await vi.waitFor(() => {
    expect(client.inspectors.value.some((inspector) => inspector.id === 'async-inspector')).toBe(
      true,
    )
    expect(client.timelineLayers.value.some((layer) => layer.id === 'async-layer')).toBe(true)
    expect(reads).toBeGreaterThanOrEqual(2)
  })
  expect(client.components.value.some((node) => node.id === 'early-patch')).toBe(false)
})

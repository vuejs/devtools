// @vitest-environment happy-dom

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeQuery } from '../../../packages/kit/src/runtime/types'

const { query, dispose, onFrameActivated } = vi.hoisted(() => ({
  query: vi.fn<(request: RuntimeQuery) => Promise<unknown>>(),
  dispose: vi.fn(),
  onFrameActivated: vi.fn(),
}))
vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({
    query,
    dispose,
    command: async () => ({ status: 1 }),
    onEvent: () => () => {},
    frames: {
      getFrames: () => [],
      getActiveFrameId: () => 0,
      onFramesChanged: () => () => {},
      onFrameActivated,
    },
  }),
}))

let module: typeof import('../../../packages/client/src/composables/devtools-client')
let requests: Array<{
  appId?: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}>
let activateFrame: (frame: { frameId: number }, reason: string) => void
beforeEach(async () => {
  vi.resetModules()
  requests = []
  onFrameActivated.mockImplementation((handler) => {
    activateFrame = handler
    return () => {}
  })
  query.mockImplementation(async (request) => {
    switch (request.type) {
      case 'devtools:capabilities':
        return { openInEditor: false }
      case 'apps:snapshot':
        return { apps: ['a', 'b'].map((id) => ({ id, name: id, componentCount: 1 })) }
      case 'plugins:snapshot':
        return { plugins: [] }
      case 'components:treeSnapshot':
        return new Promise((resolve, reject) =>
          requests.push({ appId: request.appId, resolve, reject }),
        )
      case 'router:snapshot':
        return { appId: request.appId, routes: [] }
      case 'inspectors:list':
        return { inspectors: [{ id: request.appId, label: request.appId }] }
      default:
        return undefined
    }
  })
  module = await import('../../../packages/client/src/composables/devtools-client')
})
afterEach(() => module.stopDevtoolsClient())

function tree(appId: string, name = appId) {
  return { nodes: [{ id: `${appId}:root`, appId, name, updatedAt: 1 }] }
}

describe('app refresh races', () => {
  it('keeps app B after the older app A tree resolves', async () => {
    const c = module.useDevtoolsClient()
    c.selectApp('a')
    await flushPromises()
    c.selectApp('b')
    await flushPromises()
    requests[1]!.resolve(tree('b'))
    await flushPromises()
    requests[0]!.resolve(tree('a'))
    await flushPromises()
    expect(c.selectedAppId.value).toBe('b')
    expect(c.components.value[0]?.appId).toBe('b')
    expect(c.routerSnapshot.value.appId).toBe('b')
    expect(c.inspectors.value[0]?.id).toBe('b')
  })

  it('ignores an old failure without clearing the newer request loading state or disconnecting', async () => {
    const c = module.useDevtoolsClient()
    c.selectApp('a')
    await flushPromises()
    c.selectApp('b')
    await flushPromises()
    requests[0]!.reject(new Error('old failure'))
    await flushPromises()
    expect(c.loading.value).toBe(true)
    expect(c.error.value).toBeUndefined()
    expect(dispose).not.toHaveBeenCalled()
    requests[1]!.resolve(tree('b'))
    await flushPromises()
    expect(c.connected.value).toBe(true)
  })

  it('ignores the first A response after switching A to B and back to A', async () => {
    const c = module.useDevtoolsClient()
    for (const id of ['a', 'b', 'a']) {
      c.selectApp(id)
      await flushPromises()
    }
    requests[2]!.resolve(tree('a', 'latest A'))
    await flushPromises()
    requests[0]!.resolve(tree('a', 'old A'))
    requests[1]!.resolve(tree('b'))
    await flushPromises()
    expect(c.components.value[0]?.name).toBe('latest A')
  })

  it('drops requests from the previous frame even when app ids are reused', async () => {
    const c = module.useDevtoolsClient()
    c.selectApp('a')
    await flushPromises()
    activateFrame({ frameId: 1 }, 'selected')
    await flushPromises()
    requests[1]!.resolve(tree('a', 'new frame'))
    await flushPromises()
    requests[0]!.resolve(tree('a', 'old frame'))
    await flushPromises()
    expect(c.components.value[0]?.name).toBe('new frame')
  })

  it('does not publish a refresh after the client stops', async () => {
    const c = module.useDevtoolsClient()
    module.startDevtoolsClient()
    await flushPromises()
    module.stopDevtoolsClient()
    requests[0]!.resolve(tree('a'))
    await flushPromises()
    expect(c.connected.value).toBe(false)
    expect(c.loading.value).toBe(false)
    expect(c.components.value).toEqual([])
  })
})

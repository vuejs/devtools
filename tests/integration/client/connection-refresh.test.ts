// @vitest-environment happy-dom

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { command, dispose, onEvent, query, transport } = vi.hoisted(() => ({
  transport: {
    onConnectionChanged: undefined as
      | undefined
      | ((handler: (status: 'connecting' | 'connected' | 'closed') => void) => () => void),
  },
  command: vi.fn(async () => ({ status: 1 as const })),
  dispose: vi.fn(),
  onEvent: vi.fn(() => () => {}),
  query: vi.fn(async (request: { type: string }) => {
    switch (request.type) {
      case 'apps:snapshot':
        return { apps: [{ componentCount: 1, id: 'app:0', name: 'Fixture', version: '3.5.0' }] }
      case 'components:treeSnapshot':
        return {
          appId: 'app:0',
          nodes: [{ appId: 'app:0', id: 'app:0:root', name: 'Root', updatedAt: 1 }],
          version: 1,
        }
      case 'router:snapshot':
        return { appId: 'app:0', routes: [] }
      case 'plugins:snapshot':
        return { plugins: [] }
      case 'inspectors:list':
        return { inspectors: [] }
      case 'components:stateSnapshot':
        return { componentId: 'app:0:root', sections: [], version: 1 }
      case 'runtime:health':
        return {
          performance: {
            attachedClients: 1,
            bufferedBytes: 0,
            bufferedEvents: 0,
            coalescedEvents: 0,
            collectionActive: true,
            droppedEvents: 0,
            emittedEvents: 0,
            receivedEvents: 0,
          },
          status: 'ready',
        }
      default:
        throw new Error(`Unexpected query: ${request.type}`)
    }
  }),
}))

vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({
    command,
    dispose,
    onEvent,
    query,
    onConnectionChanged: transport.onConnectionChanged,
  }),
}))

import {
  startDevtoolsClient,
  stopDevtoolsClient,
  useDevtoolsClient,
} from '../../../packages/client/src/composables/devtools-client'

describe('Devtools client connection refresh', () => {
  afterEach(() => {
    stopDevtoolsClient()
    transport.onConnectionChanged = undefined
    vi.useRealTimers()
  })

  it('uses transport connection events without a second health polling loop', async () => {
    vi.useFakeTimers()
    let notify: (status: 'connecting' | 'connected' | 'closed') => void = () => {}
    const unsubscribe = vi.fn()
    transport.onConnectionChanged = (handler) => {
      notify = handler
      return unsubscribe
    }
    startDevtoolsClient()
    notify('connected')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(query.mock.calls.some(([request]) => request.type === 'runtime:health')).toBe(false)
    query.mockClear()
    notify('connecting')
    notify('connected')
    await flushPromises()
    expect(query.mock.calls.some(([request]) => request.type === 'apps:snapshot')).toBe(true)
    stopDevtoolsClient()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('uses a lightweight health query instead of periodic data snapshots', async () => {
    vi.useFakeTimers()

    startDevtoolsClient()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15_000)
    await flushPromises()

    const types = query.mock.calls.map(([request]) => request.type)
    expect(types.filter((type) => type === 'apps:snapshot')).toHaveLength(1)
    expect(types.filter((type) => type === 'components:treeSnapshot')).toHaveLength(1)
    expect(types.filter((type) => type === 'plugins:snapshot')).toHaveLength(1)
    expect(types.filter((type) => type === 'runtime:health')).toHaveLength(3)
  })

  it('subscribes once per connection and cleans up before restarting', async () => {
    const unsubscribe = vi.fn()
    onEvent.mockClear()
    dispose.mockClear()
    onEvent.mockImplementation(() => unsubscribe)

    startDevtoolsClient()
    startDevtoolsClient()
    await flushPromises()
    expect(onEvent).toHaveBeenCalledTimes(1)

    stopDevtoolsClient()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)

    startDevtoolsClient()
    await flushPromises()
    expect(onEvent).toHaveBeenCalledTimes(2)

    stopDevtoolsClient()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledTimes(2)
  })
  it('ignores a health failure from a connection that was already restarted', async () => {
    vi.useFakeTimers()
    const originalQuery = query.getMockImplementation()!
    let rejectHealth!: (error: Error) => void
    query.mockImplementation((request) =>
      request.type === 'runtime:health'
        ? new Promise((_resolve, reject) => {
            rejectHealth = reject
          })
        : originalQuery(request),
    )
    startDevtoolsClient()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(5_000)
    stopDevtoolsClient()
    startDevtoolsClient()
    await flushPromises()
    dispose.mockClear()
    rejectHealth(new Error('old connection'))
    await flushPromises()
    expect(dispose).not.toHaveBeenCalled()
    expect(useDevtoolsClient().connected.value).toBe(true)
    expect(useDevtoolsClient().error.value).toBeUndefined()
    query.mockImplementation(originalQuery)
  })
})

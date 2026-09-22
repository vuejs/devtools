// @vitest-environment happy-dom

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsRpcEvent } from '../../../packages/kit/src/rpc/types'

const { command, eventHandlers, query } = vi.hoisted(() => {
  const eventHandlers: Array<(event: DevtoolsRpcEvent) => void> = []
  return {
    command: vi.fn(async () => ({ status: 1 as const })),
    eventHandlers,
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
        default:
          throw new Error(`Unexpected query: ${request.type}`)
      }
    }),
  }
})

vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({
    command,
    dispose: vi.fn(),
    onEvent(handler: (event: DevtoolsRpcEvent) => void) {
      eventHandlers.push(handler)
      return () => {
        const index = eventHandlers.indexOf(handler)
        if (index >= 0) eventHandlers.splice(index, 1)
      }
    },
    query,
  }),
}))

import {
  startDevtoolsClient,
  stopDevtoolsClient,
  useDevtoolsClient,
} from '../../../packages/client/src/composables/devtools-client'

describe('Timeline controls under event bursts', () => {
  afterEach(() => {
    stopDevtoolsClient()
    vi.useRealTimers()
  })

  it('applies stop and clear before queued event-list rendering', async () => {
    vi.useFakeTimers()
    const client = useDevtoolsClient()
    client.clearTimelineEvents()
    if (!client.timelineRecording.value) client.toggleTimelineRecording()
    startDevtoolsClient()
    await flushPromises()
    const emit = eventHandlers[0]!

    for (let index = 0; index < 1_000; index += 1) {
      emit({
        type: 'timeline:eventAdded',
        time: index,
        layerId: 'keyboard',
        title: `key-${index}`,
      })
    }

    client.toggleTimelineRecording()
    client.clearTimelineEvents()
    await vi.advanceTimersByTimeAsync(20)

    expect(client.timelineRecording.value).toBe(false)
    expect(client.timeline.value).toEqual([])
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'timeline:setRecording',
        payload: expect.objectContaining({ recording: false }),
      }),
    )
    expect(command).toHaveBeenCalledWith({ type: 'timeline:clear' })
  })
})

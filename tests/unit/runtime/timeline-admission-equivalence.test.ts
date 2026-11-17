import { afterEach, expect, it, vi } from 'vitest'
import { ValueHandleRegistry } from '../../../packages/kit/src/codec'
import { resolveRuntimeBudget } from '../../../packages/kit/src/runtime/budget'
import { createRuntimeEventLog } from '../../../packages/kit/src/runtime/events'
import { createRuntimePerformanceMonitor } from '../../../packages/kit/src/runtime/performance'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createRuntimeTimeline } from '../../../packages/kit/src/runtime/timeline'
import { createRuntimeTimeline as createLegacyTimeline } from './fixtures/legacy-timeline'

afterEach(() => vi.restoreAllMocks())

async function exercise(create: typeof createRuntimeTimeline, advancingClock: boolean) {
  const format = vi.spyOn(Number.prototype, 'toFixed')
  format.mockClear()
  const wire: string[] = []
  const calls: string[] = []
  let now = 0
  let clockReads = 0
  vi.spyOn(Date, 'now').mockImplementation(() => {
    clockReads++
    return advancingClock ? now++ : now
  })
  const events = createRuntimeEventLog()
  const performance = createRuntimePerformanceMonitor(true)
  let active = true
  const runtime = {
    events,
    performance,
    budget: resolveRuntimeBudget(),
    subscribe: (type: '*', handler: Parameters<typeof events.subscribe>[1]) =>
      events.subscribe(type, handler),
    isCollectionActive: () => active,
    registry: {
      getComponentId() {
        calls.push('id')
        return 'component:1'
      },
      getComponent() {
        calls.push('record')
        return { name: 'Example' }
      },
    },
  } as unknown as DevtoolsRuntime
  events.subscribe('*', (event) => {
    if (event.type.startsWith('timeline:')) wire.push(JSON.stringify(event))
  })
  const timeline = create(runtime, new ValueHandleRegistry())
  const instance = {}
  const send = (type: 'perf:start' | 'perf:end', phase = 'render', timestamp = 1) => {
    events.dispatch({
      type,
      instance,
      appId: 'app:0',
      time: 12,
      timestamp,
      get phase() {
        calls.push(`phase:${type}`)
        return phase
      },
    })
  }
  events.subscribe('perf:start', () => calls.push('plugin:start'))
  events.subscribe('perf:end', () => calls.push('plugin:end'))
  send('perf:end', 'mount', 3.12345)
  send('perf:start', 'mount', 1)
  for (let index = 0; index < 600; index++) {
    send('perf:start', 'render', index)
    send('perf:start', 'patch', index)
    send('perf:end', 'patch', index + 0.12345)
    send('perf:end', 'render', index + 0.67891)
    if (index % 100 === 0)
      timeline.addEvent({ layerId: 'plugin', title: 'custom', data: { index } })
  }
  await Promise.resolve()
  for (const boundary of [999, 1000, 1001, 2000]) {
    now = boundary
    send('perf:start')
    send('perf:end')
    await Promise.resolve()
  }
  active = false
  send('perf:start', 'inactive')
  active = true
  now = 5000
  send('perf:end', 'inactive')
  timeline.setRecording(false)
  send('perf:start')
  timeline.setRecording(true)
  send('perf:end')
  timeline.setDisabledLayerIds(['performance'])
  send('perf:start')
  timeline.setDisabledLayerIds([])
  send('perf:end')
  send('perf:start')
  timeline.addEvent({
    layerId: 'plugin',
    title: 'getters',
    get time() {
      calls.push('custom:time')
      return 42
    },
    get data() {
      calls.push('custom:data')
      return { value: 1 }
    },
    get meta() {
      calls.push('custom:meta')
      return { value: 2 }
    },
  })
  await Promise.resolve()
  timeline.dispose()
  return {
    wire,
    calls,
    clockReads,
    counters: performance.snapshot(),
    formatCalls: format.mock.calls.length,
  }
}

it.each([false, true])(
  'matches the old timeline wire, hook calls, clock reads and drops (advancing clock: %s)',
  async (advancingClock) => {
    const legacy = await exercise(createLegacyTimeline, advancingClock)
    const current = await exercise(createRuntimeTimeline, advancingClock)
    const { formatCalls: oldFormats, ...oldBehavior } = legacy
    const { formatCalls: newFormats, ...newBehavior } = current
    expect(newBehavior).toEqual(oldBehavior)
    expect(newFormats).toBeLessThan(oldFormats)
    expect(current.counters.droppedEvents).toBeGreaterThan(0)
    expect(current.wire.some((entry) => entry.includes('eventsLimited'))).toBe(true)
  },
)

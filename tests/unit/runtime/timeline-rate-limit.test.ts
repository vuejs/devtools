import { afterEach, expect, it, vi } from 'vitest'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createComponentTreeFixture } from '../../fixtures'
import * as codec from '../../../packages/kit/src/codec'

afterEach(() => vi.useRealTimers())

it('pairs performance events across component registration', async () => {
  const runtime = createDevtoolsRuntime()
  try {
    const fixture = createComponentTreeFixture(2)
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const instance = fixture.instances[1]!
    const events = vi.fn()
    runtime.subscribe('timeline:eventAdded', events)
    runtime.dispatch({
      type: 'perf:start',
      appId: 'app:0',
      instance,
      phase: 'mount',
      timestamp: 10,
      time: 10,
    })
    runtime.dispatch({ type: 'component:add', appId: 'app:0', instance, time: 11 })
    runtime.dispatch({
      type: 'perf:end',
      appId: 'app:0',
      instance,
      phase: 'mount',
      timestamp: 12,
      time: 12,
    })
    await runtime.scheduler.flush()
    expect(events).toHaveBeenCalledTimes(2)
    expect(events.mock.calls[1]![0].groupId).toBe(events.mock.calls[0]![0].groupId)
  } finally {
    runtime.dispose()
  }
})

it.each([false, true])(
  'keeps unregistered instances separate (end first: %s)',
  async (endFirst) => {
    const runtime = createDevtoolsRuntime()
    try {
      const fixture = createComponentTreeFixture(3)
      runtime.dispatch({
        type: 'app:init',
        app: fixture.app,
        version: '3.5.0',
        vueTypes: {},
        time: 1,
      })
      const events = vi.fn()
      runtime.subscribe('timeline:eventAdded', events)
      const send = (type: 'perf:start' | 'perf:end', index: number) =>
        runtime.dispatch({
          type,
          appId: 'app:0',
          instance: fixture.instances[index]!,
          phase: 'mount',
          timestamp: type === 'perf:start' ? index : index + 10,
          time: 1,
        })
      for (const type of endFirst
        ? (['perf:end', 'perf:start'] as const)
        : (['perf:start', 'perf:end'] as const)) {
        send(type, 1)
        send(type, 2)
      }
      await runtime.scheduler.flush()
      expect(events).toHaveBeenCalledTimes(4)
      const groups = events.mock.calls.map(([event]) => event.groupId)
      expect(new Set(groups).size).toBe(2)
      for (const groupId of new Set(groups))
        expect(groups.filter((id) => id === groupId)).toHaveLength(2)
    } finally {
      runtime.dispose()
    }
  },
)

it.each([{ recording: false }, { disabledLayerIds: ['performance'] }])(
  'clears pending performance pairs when recording is disabled: %j',
  async (payload) => {
    const runtime = createDevtoolsRuntime()
    try {
      const fixture = createComponentTreeFixture(3)
      runtime.dispatch({
        type: 'app:init',
        app: fixture.app,
        version: '3.5.0',
        vueTypes: {},
        time: 1,
      })
      const events = vi.fn()
      runtime.subscribe('timeline:eventAdded', events)
      const send = (type: 'perf:start' | 'perf:end', index: number) =>
        runtime.dispatch({
          type,
          appId: 'app:0',
          instance: fixture.instances[index]!,
          phase: 'mount',
          timestamp: 10,
          time: 10,
        })
      send('perf:start', 1)
      send('perf:end', 2)
      await runtime.command({ type: 'timeline:setRecording', payload })
      await runtime.command({
        type: 'timeline:setRecording',
        payload: { recording: true, disabledLayerIds: [] },
      })
      send('perf:end', 1)
      send('perf:start', 2)
      await runtime.scheduler.flush()
      expect(events).toHaveBeenCalledTimes(2)
      expect(events.mock.calls[0]![0].groupId).not.toBe(events.mock.calls[1]![0].groupId)
    } finally {
      runtime.dispose()
    }
  },
)

it('shares the pre-encoding budget between plugin and built-in events', async () => {
  vi.useFakeTimers()
  const runtime = createDevtoolsRuntime({ budget: { timeline: { maxEventsPerSecond: 1 } } })
  try {
    const fixture = createComponentTreeFixture(1)
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const events = vi.fn()
    const limited = vi.fn()
    runtime.subscribe('timeline:eventAdded', events)
    runtime.subscribe('timeline:eventsLimited', limited)
    await runtime.command({
      type: 'timeline:addEvent',
      payload: {
        pluginId: 'custom',
        options: {
          layerId: 'custom',
          all: true,
          event: { time: Date.now(), title: 'first', data: { value: 1 } },
        },
      },
    })
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: 'custom', all: true, title: 'first' }),
    )
    const encode = vi.spyOn(codec, 'encodeValue')
    await runtime.command({
      type: 'timeline:addEvent',
      payload: {
        options: {
          layerId: 'custom',
          event: { time: Date.now(), title: 'second', data: { value: 2 } },
        },
      },
    })
    runtime.dispatch({
      type: 'component:emit',
      appId: 'app:0',
      instance: fixture.instances[0]!,
      event: 'update',
      args: [],
      time: 2,
    })
    await Promise.resolve()
    expect(encode).not.toHaveBeenCalled()
    expect(events).toHaveBeenCalledTimes(1)
    expect(limited).toHaveBeenCalledWith(expect.objectContaining({ layerId: 'custom', dropped: 1 }))
    expect(limited).toHaveBeenCalledWith(
      expect.objectContaining({ layerId: 'component-event', dropped: 1 }),
    )
  } finally {
    runtime.dispose()
  }
})

it('limits built-in events before reading payloads and reports drops before resuming', async () => {
  vi.useFakeTimers()
  const runtime = createDevtoolsRuntime({ budget: { timeline: { maxEventsPerSecond: 1 } } })
  try {
    const fixture = createComponentTreeFixture(1)
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const events = vi.fn()
    const limited = vi.fn()
    runtime.subscribe('timeline:eventAdded', events)
    runtime.subscribe('timeline:eventsLimited', limited)
    const send = (args: unknown[]) =>
      runtime.dispatch({
        type: 'component:emit',
        appId: 'app:0',
        instance: fixture.instances[0]!,
        event: 'update',
        args,
        time: 2,
      })
    send([])
    const encode = vi.spyOn(codec, 'encodeValue')
    const read = vi.fn(() => 'expensive')
    const args: unknown[] = []
    Object.defineProperty(args, '0', { get: read, enumerable: true })
    send(args)
    send(args)
    await Promise.resolve()
    expect(read).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
    expect(events).toHaveBeenCalledTimes(1)
    expect(limited).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ layerId: 'component-event', dropped: 2 }),
    )
    expect(runtime.performance.snapshot().droppedEvents).toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    send([])
    expect(events).toHaveBeenCalledTimes(2)
    expect(encode).toHaveBeenCalled()
  } finally {
    runtime.dispose()
  }
})

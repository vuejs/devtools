import { effectScope } from 'vue'
import { expect, it, vi } from 'vitest'
import { createDevtoolsTimeline } from '../../../packages/client/src/composables/devtools-timeline'

it('bounds pending events while rendering is suspended and keeps the newest events', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  const scope = effectScope()
  try {
    const timeline = scope.run(() => createDevtoolsTimeline(() => undefined))!
    for (let i = 0; i < 6_000; i++)
      timeline.handleTimelineEvent({
        type: 'timeline:eventAdded',
        time: i,
        layerId: 'test',
        title: `event-${i}`,
      })
    expect(frames).toHaveLength(1)
    frames.shift()!(0)
    expect(timeline.timeline.value).toHaveLength(250)
    expect(timeline.timeline.value[0]).toMatchObject({
      dropped: 1_000,
      title: 'Events dropped',
      subtitle: 'Client pending queue limit reached',
    })
    expect(timeline.timeline.value[1]?.title).toBe('event-1000')
    while (frames.length) frames.shift()!(0)
    expect(timeline.timeline.value.length).toBeLessThanOrEqual(5_000)
    expect(timeline.timeline.value.some((event) => event.title === 'event-5999')).toBe(true)

    timeline.handleTimelineEvent({
      type: 'timeline:eventAdded',
      time: 6_000,
      layerId: 'test',
      title: 'stale',
    })
    timeline.clearTimelineEvents()
    timeline.handleTimelineEvent({
      type: 'timeline:eventAdded',
      time: 6_001,
      layerId: 'test',
      title: 'fresh',
    })
    while (frames.length) frames.shift()!(0)
    expect(timeline.timeline.value.map((event) => event.title)).toEqual(['fresh'])
  } finally {
    scope.stop()
  }
})

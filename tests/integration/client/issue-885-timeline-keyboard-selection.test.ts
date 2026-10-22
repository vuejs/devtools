// @vitest-environment happy-dom

import type { TimelineEntry } from '../../../packages/client/src/composables/devtools-client'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import Timeline from '../../../packages/client/src/pages/timeline.vue'

const { inspectTimelineEvent } = vi.hoisted(() => ({ inspectTimelineEvent: vi.fn() }))

vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () => ({
    apps: ref([]),
    clearTimelineEvents: vi.fn(),
    formatValue: vi.fn(),
    isTimelineLayerEnabled: () => true,
    inspectTimelineEvent,
    selectedTimelineLayerId: ref('component-event'),
    selectedAppId: ref('app:0'),
    selectTimelineLayer: vi.fn(),
    timeline: ref<TimelineEntry[]>([
      {
        id: 1,
        type: 'timeline:eventAdded',
        time: 1_000,
        label: 'submit',
        title: 'Form submit',
        subtitle: 'start',
        layerId: 'component-event',
        groupId: 1,
      },
      {
        id: 2,
        type: 'timeline:eventAdded',
        time: 1_010,
        label: 'submit',
        title: 'Form submit',
        subtitle: 'end',
        layerId: 'component-event',
        groupId: 1,
      },
      {
        id: 3,
        type: 'timeline:eventAdded',
        time: 1_020,
        label: 'change',
        layerId: 'component-event',
      },
    ]),
    timelineLayers: ref([]),
    timelineRecording: ref(true),
    toggleTimelineLayerEnabled: vi.fn(),
    toggleTimelineRecording: vi.fn(),
  }),
}))

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => wrapper?.unmount())

function mountTimeline() {
  wrapper = mount(Timeline, {
    attachTo: document.body,
    global: {
      directives: { tooltip: {} },
      stubs: {
        AppList: true,
        Pane: { template: '<div><slot /></div>' },
        Splitpanes: { template: '<div><slot /></div>' },
        RecycleScroller: {
          props: ['items'],
          methods: { scrollToItem: vi.fn() },
          template:
            '<ul class="event-list"><li v-for="item in items" :key="item.id"><slot :item="item" /></li></ul>',
        },
      },
    },
  })
  return wrapper
}

// https://github.com/vuejs/devtools/issues/885
describe('Timeline event keyboard selection', () => {
  it('renders focusable native buttons with complete names and the current selection', async () => {
    const page = mountTimeline()
    await flushPromises()
    const rows = page.get('.event-list').findAll('li > button')

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const button = row.element as HTMLButtonElement
      expect(row.attributes('type')).toBe('button')
      expect(button.tabIndex).toBe(0)
      button.focus()
      expect(document.activeElement).toBe(row.element)
    }
    expect(rows.map((row) => row.attributes('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(rows[0]!.attributes('aria-label')).toContain('Form submit, start')
    // Grouped rows omit the repeated visible title, but must retain it in their accessible name.
    expect(rows[1]!.text()).not.toContain('Form submit')
    expect(rows[1]!.attributes('aria-label')).toContain('Form submit, end')
    expect(rows[2]!.attributes('aria-label')).toContain('change')
    expect(inspectTimelineEvent).not.toHaveBeenCalled()
  })

  it('selects and inspects the activated event, including repeated activation', async () => {
    const page = mountTimeline()
    await flushPromises()
    const rows = page.get('.event-list').findAll('li > button')

    expect(rows).toHaveLength(3)

    await rows[0]!.trigger('click')
    expect(rows.map((row) => row.attributes('aria-pressed'))).toEqual(['true', 'false', 'false'])
    expect(inspectTimelineEvent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }))

    await rows[1]!.trigger('click')
    expect(rows.map((row) => row.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(inspectTimelineEvent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2 }))

    await rows[1]!.trigger('click')
    expect(rows[1]!.attributes('aria-pressed')).toBe('true')
    expect(inspectTimelineEvent).toHaveBeenCalledTimes(3)
  })
})

// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { createDevtoolsTimeline } from '../../../packages/client/src/composables/devtools-timeline'
import Timeline from '../../../packages/client/src/pages/timeline.vue'

vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () => client,
}))

function createClient() {
  return {
    ...createDevtoolsTimeline(() => undefined),
    apps: ref([]),
    selectedAppId: ref('app:0'),
    formatValue: vi.fn(() => ''),
    inspectTimelineEvent: vi.fn(),
  }
}

let client: ReturnType<typeof createClient>
let scope: ReturnType<typeof effectScope>
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  localStorage.clear()
  scope = effectScope()
  client = scope.run(createClient)!
  client.selectTimelineLayer('mouse')
})

afterEach(() => {
  wrapper?.unmount()
  scope.stop()
  localStorage.clear()
})

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
describe('Timeline layer keyboard selection', () => {
  it('renders built-in and dynamic layers with separate focusable selection and collection buttons', async () => {
    client.timelineLayers.value = [
      { id: 'plugin:actions', label: 'Plugin actions', appId: 'app:0' },
    ]
    client.timeline.value = [
      { id: 1, type: 'timeline:eventAdded', time: 1, label: 'action', layerId: 'custom-events' },
    ]
    const select = vi.spyOn(client, 'selectTimelineLayer')
    const page = mountTimeline()
    await flushPromises()
    const rows = page.get('ul.no-scrollbar').findAll('li')

    expect(rows).toHaveLength(6)
    expect(page.find('button button').exists()).toBe(false)
    expect(rows.map((row) => row.findAll('button').length)).toEqual([2, 2, 2, 2, 2, 2])
    expect(rows.map((row) => row.get('button').text())).toEqual([
      'Mouse',
      'Keyboard',
      'Component events',
      'Performance',
      'Plugin actions',
      'Custom Events',
    ])
    expect(rows.map((row) => row.get('button').attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ])
    for (const row of rows) {
      for (const button of row.findAll('button')) {
        expect(button.attributes('type')).toBe('button')
        expect((button.element as HTMLButtonElement).tabIndex).toBe(0)
        ;(button.element as HTMLButtonElement).focus()
        expect(document.activeElement).toBe(button.element)
      }
      expect(row.findAll('button')[1]!.attributes('aria-label')).toBe(
        `Disable ${row.get('button').text()} layer`,
      )
    }
    expect(select).not.toHaveBeenCalled()
    expect(client.selectedTimelineLayerId.value).toBe('mouse')
  })

  it('selects layers without changing collection state, including repeated selection', async () => {
    const select = vi.spyOn(client, 'selectTimelineLayer')
    const toggle = vi.spyOn(client, 'toggleTimelineLayerEnabled')
    const page = mountTimeline()
    await flushPromises()
    const rows = page.get('ul.no-scrollbar').findAll('li')
    const keyboard = rows[1]!.get('button')

    await keyboard.trigger('click')
    expect(select).toHaveBeenCalledExactlyOnceWith('keyboard')
    expect(client.selectedTimelineLayerId.value).toBe('keyboard')
    expect(rows[0]!.get('button').attributes('aria-pressed')).toBe('false')
    expect(keyboard.attributes('aria-pressed')).toBe('true')

    await keyboard.trigger('click')
    expect(select).toHaveBeenCalledTimes(2)
    expect(keyboard.attributes('aria-pressed')).toBe('true')
    expect(toggle).not.toHaveBeenCalled()
    expect(client.inspectTimelineEvent).not.toHaveBeenCalled()
  })

  it('toggles collection independently while keeping a disabled layer selectable and focused', async () => {
    client.timeline.value = [
      { id: 1, type: 'timeline:eventAdded', time: 1, label: 'mouse event', layerId: 'mouse' },
    ]
    const select = vi.spyOn(client, 'selectTimelineLayer')
    const clear = vi.spyOn(client, 'clearTimelineEvents')
    const page = mountTimeline()
    await flushPromises()
    const rows = page.get('ul.no-scrollbar').findAll('li')
    const mouse = rows[0]!.get('button')
    const toggleMouse = rows[0]!.get('button[aria-label="Disable Mouse layer"]')
    ;(toggleMouse.element as HTMLButtonElement).focus()

    await toggleMouse.trigger('click')
    expect(client.isTimelineLayerEnabled('mouse')).toBe(false)
    expect(select).not.toHaveBeenCalled()
    expect(client.selectedTimelineLayerId.value).toBe('mouse')
    expect(mouse.attributes('aria-pressed')).toBe('true')
    expect(mouse.attributes('disabled')).toBeUndefined()
    expect(mouse.attributes('aria-disabled')).toBeUndefined()
    expect(toggleMouse.attributes('aria-label')).toBe('Enable Mouse layer')
    expect(document.activeElement).toBe(toggleMouse.element)
    expect(page.find('.event-list').exists()).toBe(false)

    await rows[1]!.get('button').trigger('click')
    await mouse.trigger('click')
    expect(client.selectedTimelineLayerId.value).toBe('mouse')
    expect(client.isTimelineLayerEnabled('mouse')).toBe(false)
    await toggleMouse.trigger('click')
    expect(toggleMouse.attributes('aria-label')).toBe('Disable Mouse layer')
    expect(page.get('.event-list').text()).toContain('mouse event')
    expect(client.timeline.value).toHaveLength(1)
    expect(clear).not.toHaveBeenCalled()
    expect(client.inspectTimelineEvent).not.toHaveBeenCalled()
  })
})

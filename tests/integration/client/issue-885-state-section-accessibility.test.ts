// @vitest-environment happy-dom

import type { ComponentStateSnapshotMessage } from '../../../packages/kit/src'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({
    command: vi.fn(async () => ({ status: 1 as const })),
    dispose: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    query: vi.fn(),
  }),
}))

import InspectorState from '../../../packages/client/src/components/common/InspectorState.vue'

// https://github.com/vuejs/devtools/issues/885
describe('InspectorState section accessibility', () => {
  let wrapper: ReturnType<typeof mountInspectorState>

  afterEach(() => wrapper?.unmount())

  it('exposes named, focusable disclosure buttons with the initial expanded state', () => {
    wrapper = mountInspectorState()
    const buttons = wrapper.findAll<HTMLButtonElement>('section > button')

    expect(buttons.map((button) => button.get('.font-state-field').text())).toEqual([
      'setup',
      'props',
      'data',
    ])
    expect(buttons[2]!.text()).toContain('partial')
    for (const button of buttons) {
      expect(button.attributes('type')).toBe('button')
      expect(button.attributes('aria-expanded')).toBe('true')
      expect(button.element.tabIndex).toBe(0)
      button.element.focus()
      expect(document.activeElement).toBe(button.element)
    }
  })

  it('toggles one section without collapsing the others and keeps focus on its button', async () => {
    wrapper = mountInspectorState()
    const sections = wrapper.findAll('section')
    const setup = sections[0]!.get<HTMLButtonElement>('button[aria-expanded]')
    setup.element.focus()

    await setup.trigger('click')

    expect(setup.attributes('aria-expanded')).toBe('false')
    expect(sections[0]!.find('.state-key').exists()).toBe(false)
    expect(sections[1]!.get('button[aria-expanded]').attributes('aria-expanded')).toBe('true')
    expect(sections[1]!.get('.state-key').text()).toBe('title')
    expect(sections[2]!.get('.state-key').text()).toBe('active')
    expect(document.activeElement).toBe(setup.element)

    await setup.trigger('click')

    expect(setup.attributes('aria-expanded')).toBe('true')
    expect(sections[0]!.get('.state-key').text()).toBe('count')
    expect(document.activeElement).toBe(setup.element)
  })

  it('preserves collapse on a state refresh and expands sections for a new component', async () => {
    wrapper = mountInspectorState()
    const setup = wrapper.get('section > button')
    await setup.trigger('click')

    await wrapper.setProps({ state: { ...snapshot(), version: 2 } })
    expect(setup.attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('.state-key').map((entry) => entry.text())).toEqual(['title', 'active'])

    await wrapper.setProps({
      selectedNodeId: 'component:two',
      state: { ...snapshot(), componentId: 'component:two' },
    })
    await flushPromises()

    expect(
      wrapper.findAll('section > button').map((button) => button.attributes('aria-expanded')),
    ).toEqual(['true', 'true', 'true'])
    expect(wrapper.findAll('.state-key').map((entry) => entry.text())).toEqual([
      'count',
      'title',
      'active',
    ])
  })

  it('keeps editing and Show more actions outside the disclosure button', async () => {
    wrapper = mountInspectorState()
    const sections = wrapper.findAll('section')
    const setup = sections[0]!.get('button[aria-expanded]')
    const edit = sections[0]!.get('[aria-label="Edit state value"]')

    expect(setup.element.contains(edit.element)).toBe(false)
    await edit.trigger('click')
    expect(setup.attributes('aria-expanded')).toBe('true')
    expect(sections[0]!.get('input').element.value).toBe('1')
    await sections[0]!.get('[aria-label="Cancel state value edit"]').trigger('click')
    expect(sections[0]!.find('input').exists()).toBe(false)

    const data = sections[2]!.get('button[aria-expanded]')
    const showMore = sections[2]!.findAll('button').find((button) => button.text() === 'Show more')!
    expect(data.element.contains(showMore.element)).toBe(false)
    await showMore.trigger('click')
    expect(wrapper.emitted('show-more')).toEqual([['data']])
    expect(data.attributes('aria-expanded')).toBe('true')

    await data.trigger('click')
    expect(sections[2]!.findAll('button')).toHaveLength(1)
    await data.trigger('click')
    expect(sections[2]!.text()).toContain('Show more')
  })
})

function mountInspectorState() {
  return mount(InspectorState, {
    attachTo: document.body,
    global: {
      directives: { tooltip: {} },
      stubs: { DevtoolsIcon: true },
    },
    props: {
      filter: '',
      selectedNodeId: 'component:one',
      showMoreText: 'Show more',
      state: snapshot(),
    },
  })
}

function snapshot(): ComponentStateSnapshotMessage {
  return {
    componentId: 'component:one',
    version: 1,
    sections: [
      {
        id: 'setup',
        label: 'setup',
        entries: [
          {
            key: 'count',
            path: ['setup', 'count'],
            editable: true,
            value: { kind: 'number', value: 1 },
          },
        ],
      },
      {
        id: 'props',
        label: 'props',
        entries: [
          {
            key: 'title',
            path: ['props', 'title'],
            editable: false,
            value: { kind: 'string', value: 'Hello' },
          },
        ],
      },
      {
        id: 'data',
        label: 'data',
        partial: true,
        entries: [
          {
            key: 'active',
            path: ['data', 'active'],
            editable: false,
            value: { kind: 'boolean', value: true },
          },
        ],
      },
    ],
  }
}

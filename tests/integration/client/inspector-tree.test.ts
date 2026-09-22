// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import type { DirectiveBinding } from 'vue'
import { describe, expect, it } from 'vitest'
import InspectorTree from '../../../packages/client/src/components/common/InspectorTree.vue'

describe('InspectorTree', () => {
  it('renders tree rows and emits selection through user interaction', async () => {
    const wrapper = mountTree()

    const rows = wrapper.findAll('[role="treeitem"]')
    expect(rows.map((row) => row.text())).toEqual(['Root', 'Child'])

    await rows[1]!.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['child']])
    wrapper.unmount()
  })

  it('emits the visible search value', async () => {
    const wrapper = mountTree()

    await wrapper.find('input[type="search"]').setValue('child')
    await wrapper.setProps({ filter: 'child' })
    await wrapper.find('[aria-label="Clear filter"]').trigger('click')

    expect(wrapper.emitted('update:filter')).toEqual([['child'], ['']])
    wrapper.unmount()
  })

  it('keeps the rendered row count bounded for large trees', () => {
    const wrapper = mount(InspectorTree, {
      global: {
        directives: { tooltip: {} },
        stubs: { DevtoolsIcon: true },
      },
      props: {
        filter: '',
        nodes: Array.from({ length: 10_000 }, (_, index) => ({
          id: `node-${index}`,
          label: `Node ${index}`,
        })),
        refreshVisible: false,
      },
    })

    expect(wrapper.findAll('[role="treeitem"]').length).toBeLessThan(50)
    wrapper.unmount()
  })

  it('decodes legacy HTML entities in component tag tooltips as plain text', () => {
    const tooltipValues: string[] = []
    const wrapper = mount(InspectorTree, {
      global: {
        directives: {
          tooltip: {
            mounted(_element: HTMLElement, binding: DirectiveBinding<string>) {
              tooltipValues.push(binding.value)
            },
          },
        },
        stubs: { DevtoolsIcon: true },
      },
      props: {
        componentLabels: true,
        filter: '',
        nodes: [
          {
            id: 'router-view-child',
            label: 'PerformancePage',
            tags: [
              {
                label: 'performance: /performance',
                tooltip: 'This component is rendered by &lt;router-view&gt;',
              },
            ],
          },
        ],
        refreshVisible: false,
      },
    })

    expect(tooltipValues).toContain('This component is rendered by <router-view>')
    expect(tooltipValues).not.toContain('This component is rendered by &lt;router-view&gt;')
    wrapper.unmount()
  })

  it('uses an unambiguous monospace font for component tags', () => {
    const wrapper = mountTree({
      componentLabels: true,
      nodes: [
        {
          id: 'ambiguous-tag',
          label: 'AmbiguousTag',
          tags: [
            { label: '0O1Il' },
            { label: 'x' },
            {
              backgroundColor: 0x123456,
              label: 'very-long-component-tag',
              textColor: 0xfedcba,
            },
          ],
        },
      ],
    })

    const tags = wrapper.findAll('.component-tag')
    expect(tags.map((tag) => tag.text())).toEqual(['0O1Il', 'x', 'very-long-component-tag'])
    expect(tags.every((tag) => tag.classes().includes('font-state-field'))).toBe(true)
    expect(tags[2]?.attributes('style')).toContain('color: #fedcba')
    expect(tags[2]?.attributes('style')).toContain('background-color: #123456')
    wrapper.unmount()
  })

  it('keeps expansion state when a filter is applied and removed', async () => {
    const wrapper = mountTree()
    const root = wrapper.find('[role="treeitem"]')

    await root.trigger('dblclick')
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(1)

    await wrapper.setProps({ filter: 'child' })
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(2)

    await wrapper.setProps({ filter: '' })
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('exposes accessible tree metadata and a horizontal scrollbar', () => {
    const wrapper = mountTree({ selectedNodeId: 'root' })

    const root = wrapper.find('[role="treeitem"]')
    expect(root.attributes()).toMatchObject({
      'aria-expanded': 'true',
      'aria-level': '1',
      'aria-selected': 'true',
      tabindex: '0',
    })

    const rows = wrapper.findAll('[role="treeitem"]')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.attributes('aria-level')).toBe('2')
    expect(rows[1]!.attributes('tabindex')).toBe('-1')
    expect(wrapper.find('.vue-recycle-scroller').classes()).not.toContain('no-scrollbar')
    wrapper.unmount()
  })

  it('emits favorite changes without selecting the component', async () => {
    const wrapper = mountTree({ componentLabels: true })
    const favoriteButton = wrapper.find('[aria-label="Add to favorites"]')

    expect(favoriteButton.classes()).toContain('focus-visible:op100')
    expect(favoriteButton.classes()).not.toContain('focus:op100')

    await favoriteButton.trigger('click')

    expect(wrapper.emitted('toggleFavorite')).toEqual([['root']])
    expect(wrapper.emitted('select')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders last update duration next to component labels', () => {
    const wrapper = mountTree({
      componentLabels: true,
      nodes: [{ duration: '1.3ms', id: 'timed', label: 'Timed' }],
    })

    expect(wrapper.find('[role="treeitem"]').text()).toContain('1.3ms')
    wrapper.unmount()
  })
})

function mountTree(overrides: Record<string, unknown> = {}) {
  return mount(InspectorTree, {
    global: {
      directives: {
        tooltip: {},
      },
      stubs: {
        DevtoolsIcon: true,
        RecycleScroller: {
          props: ['items'],
          template:
            '<div class="vue-recycle-scroller"><template v-for="item in items" :key="item.id"><slot :item="item" /></template></div>',
          methods: {
            scrollToItem() {},
          },
        },
      },
    },
    props: {
      defaultExpandDepth: 2,
      filter: '',
      nodes: [
        {
          children: [{ id: 'child', label: 'Child' }],
          id: 'root',
          label: 'Root',
        },
      ],
      refreshVisible: false,
      ...overrides,
    },
  })
}

// @vitest-environment happy-dom

import type { ReactivityGraphSnapshot } from '../../../packages/kit/src/protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ReactivityGraph from '../../../packages/client/src/components/components/ReactivityGraph.vue'

describe('reactivity graph', () => {
  let wrapper: ReturnType<typeof mount> | undefined
  afterEach(() => wrapper?.unmount())

  it('updates selected state values without changing graph topology or selection', async () => {
    wrapper = mount(ReactivityGraph, {
      props: { graph: graphWithValue(111) },
      global: {
        directives: { tooltip: {} },
        stubs: {
          Splitpanes: { template: '<div><slot /></div>' },
          Pane: { template: '<div><slot /></div>' },
        },
      },
    })

    expect(wrapper.get('aside').text()).toContain('111')
    await wrapper.setProps({ graph: graphWithValue(222) })
    expect(wrapper.get('aside').text()).toContain('222')
    expect(wrapper.get('aside').text()).not.toContain('111')
    expect(wrapper.get('aside').text()).toContain('counter')
  })

  it('coordinates path selection, detail navigation, and type filters across panels', async () => {
    const graph = graphWithValue(111)
    graph.nodes.push({ id: 'doubled', type: 'computed', label: 'doubled', data: { value: 222 } })
    graph.relationships.push({ id: 'edge', from: 'counter', to: 'doubled' })
    wrapper = mount(ReactivityGraph, {
      props: { graph },
      global: {
        directives: { tooltip: {} },
        stubs: {
          Splitpanes: { template: '<div><slot /></div>' },
          Pane: { template: '<div><slot /></div>' },
        },
      },
    })
    await wrapper.get('[aria-label="Graph path selector"]').trigger('click')
    await wrapper.get('input[placeholder="Start"]').setValue('counter')
    const start = wrapper
      .findAll('button')
      .find((button) => button.text().includes('counter') && button.text().includes('Ref'))!
    await start.trigger('mousedown')
    await wrapper.get('input[placeholder="End"]').setValue('doubled')
    const end = wrapper
      .findAll('button')
      .find((button) => button.text().includes('doubled') && button.text().includes('Computed'))!
    await end.trigger('mousedown')
    expect(wrapper.get('aside').text()).toContain('counter')
    expect(wrapper.get('aside').text()).toContain('doubled')
    expect(wrapper.get('aside').text()).not.toContain('Relationships')
    await wrapper.get('aside button').trigger('click')
    expect(wrapper.find('input[placeholder="Search graph..."]').exists()).toBe(true)
    expect(wrapper.get('aside').text()).toContain('Relationships')
    await wrapper.get('label[title="Computed"] input').setValue(false)
    expect(wrapper.find('[aria-label="Select doubled graph node"]').exists()).toBe(false)
    expect(wrapper.get('aside').text()).not.toContain('doubled')
  })

  it('preserves selection and zoom on value changes and still filters nodes', async () => {
    const graph = graphWithValue(111)
    graph.nodes.push({ id: 'other', type: 'computed', label: 'other', data: { value: 333 } })
    graph.relationships.push({ id: 'edge', from: 'counter', to: 'other' })
    wrapper = mount(ReactivityGraph, {
      props: { graph },
      global: {
        directives: { tooltip: {} },
        stubs: {
          Splitpanes: { template: '<div><slot /></div>' },
          Pane: { template: '<div><slot /></div>' },
        },
      },
    })
    await wrapper.get('[aria-label="Select other graph node"]').trigger('click')
    await wrapper.get('[aria-label="Zoom in"]').trigger('click')
    const zoom = wrapper.get('[aria-label="Fit graph"]').text()
    await wrapper.setProps({
      graph: { ...graph, nodes: graph.nodes.map((node) => ({ ...node, data: { value: 444 } })) },
    })
    expect(wrapper.get('aside').text()).toContain('444')
    expect(wrapper.get('aside').text()).toContain('other')
    expect(wrapper.get('[aria-label="Fit graph"]').text()).toBe(zoom)
    await wrapper.get('input[placeholder="Search graph..."]').setValue('counter')
    expect(wrapper.find('[aria-label="Select other graph node"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Select counter graph node"]').exists()).toBe(true)
  })
})

function graphWithValue(value: number): ReactivityGraphSnapshot {
  return {
    nodes: [{ id: 'counter', type: 'ref', label: 'counter', data: { value } }],
    relationships: [],
  }
}

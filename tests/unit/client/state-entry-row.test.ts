// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { encodeValue, type StateEntry } from '../../../packages/kit/src'
import { ref } from 'vue'
import { createDevtoolsState } from '../../../packages/client/src/composables/devtools-state'
import StateEntryRow from '../../../packages/client/src/components/components/StateEntryRow.vue'

vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () =>
    createDevtoolsState({
      getRpcClient: () => undefined,
      runtimeVersion: ref(0),
      selectedAppId: ref(undefined),
      selectedComponentId: ref(undefined),
      error: ref(undefined),
      assertCommandSucceeded: vi.fn(),
    }),
}))

describe('reactive state value display', () => {
  it('shows values and limits the Reactive label to the owning entry', async () => {
    const wrapper = mount(StateEntryRow, {
      props: {
        depth: 0,
        entry: {
          key: 'store',
          path: ['store'],
          editable: true,
          meta: { stateTypeName: 'Reactive', raw: 'parent tooltip', section: 'setup' },
          value: encodeValue({ count: 42, name: 'hello', done: true }),
        },
      },
      global: { stubs: { StateEntryActions: true } },
    })
    expect(wrapper.text()).toContain('(Reactive)')
    expect(wrapper.text()).toContain('Object')
    await wrapper.find('.group\\/state-row').trigger('click')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('true')
    expect(wrapper.text().match(/Reactive/g)).toHaveLength(1)
    const children = wrapper.findAllComponents(StateEntryRow)
    for (const child of children) {
      const entry = (child.props() as { entry: StateEntry }).entry
      expect(entry.meta).toEqual({ section: 'setup' })
      expect(entry.editable).toBe(true)
    }
    wrapper.unmount()
  })
})

// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Switch from '../../../packages/client/src/components/common/Switch.vue'

describe('Switch', () => {
  it('uses native checkbox semantics and updates its model', async () => {
    const wrapper = mount(Switch, {
      props: {
        ariaLabel: 'Enable component updates',
        modelValue: false,
      },
    })
    const input = wrapper.get('input')

    expect(input.attributes()).toMatchObject({
      'aria-label': 'Enable component updates',
      type: 'checkbox',
    })
    expect(input.classes()).toContain('peer')

    await input.setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('keeps disabled switches non-interactive and exposes a visible focus style', () => {
    const wrapper = mount(Switch, {
      props: {
        disabled: true,
        modelValue: false,
      },
    })

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('span[aria-hidden="true"]').classes()).toContain('peer-focus-visible:ring-2')
  })
})

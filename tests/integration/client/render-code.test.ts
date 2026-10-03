// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RenderCode from '../../../packages/client/src/components/components/RenderCode.vue'

describe('RenderCode', () => {
  let opener: HTMLButtonElement

  afterEach(() => opener?.remove())

  it('exposes dialog semantics and moves focus to the close action', async () => {
    opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    const wrapper = mount(RenderCode, {
      attachTo: document.body,
      props: { code: 'const answer = 42' },
    })
    await flushPromises()

    const dialog = wrapper.get('[role="dialog"]')
    const closeButton = wrapper.get<HTMLButtonElement>('button[aria-label="Close render code"]')

    const labelledBy = dialog.attributes('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Render Code')
    expect(document.activeElement).toBe(closeButton.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
  })
})

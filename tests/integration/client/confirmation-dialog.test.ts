// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ConfirmationDialog from '../../../packages/client/src/components/common/ConfirmationDialog.vue'

describe('ConfirmationDialog', () => {
  let returnFocus: HTMLButtonElement
  let showModal: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    returnFocus = document.createElement('button')
    returnFocus.textContent = 'Open confirmation'
    document.body.append(returnFocus)
    returnFocus.focus()

    showModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.open = true
      })
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(
      function (this: HTMLDialogElement) {
        this.open = false
        this.dispatchEvent(new Event('close'))
      },
    )
  })

  afterEach(() => {
    returnFocus.remove()
  })

  it('opens as an accessible modal and focuses the safe action', async () => {
    const wrapper = mountDialog()

    await wrapper.setProps({ open: true })
    await flushPromises()

    const dialog = wrapper.get('dialog')
    expect(dialog.attributes()).toMatchObject({
      'aria-modal': 'true',
      role: 'dialog',
    })
    expect(dialog.attributes('aria-labelledby')).toBeTruthy()
    expect(dialog.attributes('aria-describedby')).toBeTruthy()
    expect(showModal).toHaveBeenCalledOnce()
    expect(document.activeElement?.textContent).toBe('Cancel')
    wrapper.unmount()
  })

  it('handles Escape and returns focus after closing', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()

    const cancelEvent = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(cancelEvent)
    expect(cancelEvent.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:open')).toContainEqual([false])

    await wrapper.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(returnFocus)
    wrapper.unmount()
  })

  it('closes on backdrop click and emits confirmation', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()

    await wrapper.get('dialog').trigger('click')
    expect(wrapper.emitted('update:open')).toContainEqual([false])

    await wrapper.get('.settings-button-warning').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })
})

function mountDialog() {
  return mount(ConfirmationDialog, {
    attachTo: document.body,
    props: {
      description: 'This action resets local settings.',
      open: false,
      title: 'Reset settings',
    },
  })
}

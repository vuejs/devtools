import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Dialog from './Dialog.vue'

describe('dialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('exposes modal semantics and an accessible close button', async () => {
    const wrapper = mount(Dialog, {
      attachTo: document.body,
      props: { modelValue: true, title: 'Settings' },
    })

    await nextTick()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)!
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(title.textContent).toContain('Settings')
    expect(close.type).toBe('button')

    close.click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('moves focus into the dialog and restores it after closing', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const wrapper = mount(Dialog, {
      attachTo: document.body,
      props: { modelValue: true },
    })

    await nextTick()
    await new Promise(resolve => setTimeout(resolve))

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.contains(document.activeElement)).toBe(true)

    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await new Promise(resolve => setTimeout(resolve))

    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })
})

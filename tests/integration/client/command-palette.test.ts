// @vitest-environment happy-dom

import type { VueWrapper } from '@vue/test-utils'
import type { DevtoolsCommand } from '../../../packages/client/src/composables/commands'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommandPalette from '../../../packages/client/src/components/common/CommandPalette.vue'
import { filterDevtoolsCommands } from '../../../packages/client/src/composables/commands'

describe('CommandPalette', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(
      function (this: HTMLDialogElement) {
        this.open = true
      },
    )
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(
      function (this: HTMLDialogElement) {
        this.open = false
      },
    )
    if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  it('opens locally and executes the keyboard-selected command', async () => {
    const openComponents = vi.fn()
    const openTimeline = vi.fn()
    wrapper = mountPalette([
      command('components', 'Open Components', openComponents),
      command('timeline', 'Open Timeline', openTimeline),
    ])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await flushPromises()

    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('input').element)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()

    expect(openComponents).not.toHaveBeenCalled()
    expect(openTimeline).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').element.open).toBe(false)
  })

  it('keeps the palette open and exposes command errors', async () => {
    const failure = vi.fn(async () => {
      throw new Error('Unable to inspect component')
    })
    wrapper = mountPalette([command('inspect', 'Inspect Component', failure)])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()

    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to inspect component')
  })

  it('opens child commands and returns to the previous level on Escape', async () => {
    const child = command('application', 'Application API', vi.fn())
    const documentation = command('documentation', 'Vue Documentation', () => [child])
    wrapper = mountPalette([documentation])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()

    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(wrapper.text()).toContain('Application API')
    expect(wrapper.get('button[aria-label="Back to previous commands"]')).toBeTruthy()

    const cancelEvent = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(cancelEvent)
    await flushPromises()

    expect(cancelEvent.defaultPrevented).toBe(true)
    expect(wrapper.text()).toContain('Vue Documentation')
    expect(wrapper.find('button[aria-label="Back to previous commands"]').exists()).toBe(false)
  })

  it('searches title, description, group and keywords', () => {
    const commands = [
      command('components', 'Open Components', vi.fn()),
      {
        ...command('inspect', 'Inspect Component', vi.fn()),
        description: 'Select from the page',
        keywords: ['locator', 'picker'],
      },
    ]

    expect(filterDevtoolsCommands(commands, 'locator').map((item) => item.id)).toEqual(['inspect'])
    expect(filterDevtoolsCommands(commands, 'open comp')[0]?.id).toBe('components')
    expect(filterDevtoolsCommands(commands, 'componets').map((item) => item.id)).toContain(
      'components',
    )
  })
})

function mountPalette(commands: DevtoolsCommand[]) {
  return mount(CommandPalette, {
    attachTo: document.body,
    props: { commands },
  })
}

function command(id: string, title: string, action: DevtoolsCommand['action']): DevtoolsCommand {
  return {
    id,
    title,
    group: 'Navigation',
    icon: 'i-carbon-launch',
    action,
  }
}

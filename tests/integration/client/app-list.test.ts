// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppList from '../../../packages/client/src/components/components/AppList.vue'

const activeFrameId = ref('frame:top')
const selectedAppId = ref('app:one')
const selectApp = vi.fn()
const selectFrame = vi.fn()

vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () => ({
    activeFrameId,
    apps: ref([
      { id: 'app:one', name: 'First app', version: '3.5.0' },
      { id: 'app:two', name: 'Second app' },
    ]),
    frames: ref([
      { frameId: 'frame:top', main: true },
      { frameId: 'frame:nested', url: 'https://example.com/nested' },
    ]),
    selectApp,
    selectFrame,
    selectedAppId,
  }),
}))

describe('AppList', () => {
  beforeEach(() => {
    activeFrameId.value = 'frame:top'
    selectedAppId.value = 'app:one'
    selectApp.mockClear()
    selectFrame.mockClear()
  })

  it('exposes frame and app entries as focusable selection buttons', async () => {
    const wrapper = mount(AppList, { attachTo: document.body })
    const buttons = wrapper.findAll('button')

    expect(buttons.map((button) => button.text())).toEqual([
      'Top frame',
      'example.com/nested',
      'First app (3.5.0)',
      'Second app',
    ])
    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ])

    buttons[0]!.element.focus()
    expect(document.activeElement).toBe(buttons[0]!.element)

    await buttons[1]!.trigger('click')
    await buttons[3]!.trigger('click')
    expect(selectFrame).toHaveBeenCalledWith('frame:nested')
    expect(selectApp).toHaveBeenCalledWith('app:two')

    wrapper.unmount()
  })
})

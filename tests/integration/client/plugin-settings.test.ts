// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PluginSettings from '../../../packages/client/src/components/plugins/PluginSettings.vue'
import type { PluginSnapshot } from '../../../packages/client/src/composables/devtools-client'

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => wrapper?.unmount())

describe('plugin settings', () => {
  it('uses defaults and emits correctly typed settings updates', async () => {
    const plugin: PluginSnapshot = {
      id: 'test',
      label: 'Test',
      settingValues: {},
      settings: {
        enabled: { type: 'boolean', defaultValue: true },
        limit: { type: 'number', defaultValue: 5 },
        name: { type: 'text', defaultValue: 'initial' },
        mode: {
          type: 'choice',
          defaultValue: 1,
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
          ],
        },
      },
    }
    wrapper = mount(PluginSettings, { props: { plugin } })
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await wrapper.get('input[type="number"]').setValue('12')
    await wrapper.get('input[type="text"]').setValue('updated')
    await wrapper.get('select').setValue('2')
    expect(wrapper.emitted('update')).toEqual([
      ['enabled', false],
      ['limit', 12],
      ['name', 'updated'],
      ['mode', 2],
    ])
    await wrapper.setProps({
      plugin: { ...plugin, id: 'other', settingValues: { name: 'other plugin' } },
    })
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe(
      'other plugin',
    )
  })
})

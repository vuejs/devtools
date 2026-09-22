// @vitest-environment happy-dom

import type { EncodedValue, StateEntry, ValueEntry } from '../../../packages/kit/src'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { command, dispose, onEvent, query } = vi.hoisted(() => ({
  command: vi.fn(async () => ({ status: 1 as const })),
  dispose: vi.fn(),
  onEvent: vi.fn(() => () => {}),
  query: vi.fn(),
}))

vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({ command, dispose, onEvent, query }),
}))

import StateEntryRow from '../../../packages/client/src/components/components/StateEntryRow.vue'
import { useDevtoolsClient } from '../../../packages/client/src/composables/devtools-client'

describe('StateEntryRow', () => {
  it.each([
    ['Object', { kind: 'object', name: 'Object', entries: 0, preview: [], handle: 'empty-object' }],
    ['Array', { kind: 'array', length: 0, preview: [], handle: 'empty-array' }],
    ['Map', { kind: 'map', size: 0, preview: [], handle: 'empty-map' }],
    ['Set', { kind: 'set', size: 0, preview: [], handle: 'empty-set' }],
  ] satisfies [string, EncodedValue][])(
    'hides the expand icon for an empty %s',
    async (_type, value) => {
      const wrapper = mountStateEntry({
        key: 'empty',
        path: ['State', 'empty'],
        editable: false,
        value,
      })

      expect(wrapper.find('.i-carbon-chevron-right').exists()).toBe(false)

      await wrapper.find('[class~="group/state-row"]').trigger('click')
      expect(query).not.toHaveBeenCalled()

      wrapper.unmount()
    },
  )

  it('keeps the expand icon for a non-empty value awaiting lazy children', async () => {
    const wrapper = mountStateEntry({
      key: 'lazy',
      path: ['State', 'lazy'],
      editable: false,
      value: {
        kind: 'object',
        name: 'Object',
        entries: 1,
        preview: [],
        handle: 'lazy-object',
      },
    })
    query.mockResolvedValue({
      handle: 'lazy-object',
      path: [],
      value: {
        kind: 'object',
        name: 'Object',
        entries: 1,
        preview: [{ key: 'child', value: { kind: 'boolean', value: true } }],
        handle: 'lazy-object',
      },
    })

    expect(wrapper.find('.i-carbon-chevron-right').exists()).toBe(true)

    await wrapper.find('[class~="group/state-row"]').trigger('click')
    await flushPromises()

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'values:expand',
        payload: { handle: 'lazy-object', maxEntries: 30 },
      }),
    )
    expect(wrapper.text()).toContain('child')

    wrapper.unmount()
  })

  it('refreshes an open lazy row after its snapshot and expansion cache are replaced', async () => {
    const entry: StateEntry = {
      key: 'live',
      path: ['State', 'live-refresh'],
      editable: false,
      value: { kind: 'object', name: 'Object', entries: 1, preview: [], handle: 'old-value' },
    }
    const expanded = (handle: string, key: string) => ({
      handle,
      path: [],
      value: {
        kind: 'object',
        name: 'Object',
        entries: 1,
        handle,
        preview: [{ key, value: { kind: 'number', value: 1 } }],
      },
    })
    query.mockResolvedValueOnce(expanded('old-value', 'old-child'))
    const wrapper = mountStateEntry(entry)
    await wrapper.find('[class~="group/state-row"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('old-child')

    query.mockResolvedValueOnce(expanded('new-value', 'new-child'))
    useDevtoolsClient().clearExpandedValues()
    await wrapper.setProps({
      entry: {
        ...entry,
        value: { kind: 'object', name: 'Object', entries: 1, preview: [], handle: 'new-value' },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('new-child')
    expect(wrapper.text()).not.toContain('old-child')
    wrapper.unmount()
  })

  it('shows not accessed instead of the undefined token', () => {
    // https://github.com/vuejs/devtools/issues/535
    const wrapper = mountStateEntry({
      key: 'lazyComputed',
      path: ['setup', 'lazyComputed'],
      editable: false,
      meta: { stateTypeName: 'Computed' },
      value: {
        kind: 'custom',
        type: 'computed-not-accessed',
        display: 'not accessed',
        tooltip: 'This computed property has never been accessed.',
        abstract: true,
        readOnly: true,
        value: { kind: 'undefined' },
      },
    })

    expect(wrapper.text()).toContain('not accessed')
    expect(wrapper.text()).toContain('(Computed)')
    expect(wrapper.find('.null-state-type').exists()).toBe(false)
    expect(wrapper.get('[title]').attributes('title')).toBe(
      'This computed property has never been accessed.',
    )

    wrapper.unmount()
  })

  it('keeps the key visible and the state type next to the value', () => {
    const wrapper = mountStateEntry({
      key: '__file',
      path: ['Routing', '$route', 'matched', '0', 'components', 'default', '__file'],
      editable: false,
      meta: { stateTypeName: 'Computed' },
      value: {
        kind: 'string',
        value: '/Users/example/project/src/pages/PerformancePage.vue',
      },
    })

    const key = wrapper.find('.state-key')
    const value = wrapper.find('.string-state-type')

    expect(key.text()).toBe('__file')
    expect(key.classes()).toEqual(expect.arrayContaining(['max-w-[40%]', 'shrink-0']))
    expect(value.classes()).toEqual(
      expect.arrayContaining(['min-w-0', 'overflow-hidden', 'text-ellipsis']),
    )
    expect(value.classes()).not.toContain('flex-1')
    expect(value.element.nextElementSibling?.textContent?.trim()).toBe('(Computed)')

    wrapper.unmount()
  })

  it('expands the displayed value inside a custom wrapper', async () => {
    const initialPreview = createPreview(30)
    const expandedPreview = createPreview(60)
    const entry: StateEntry = {
      key: '$route',
      path: ['Routing', '$route'],
      editable: false,
      value: {
        kind: 'custom',
        display: '/performance',
        handle: 'value:route-wrapper',
        value: createObjectValue(initialPreview),
      },
    }

    query.mockResolvedValue({
      handle: 'value:route',
      path: [],
      value: createObjectValue(expandedPreview),
    })

    const wrapper = mountStateEntry(entry)

    await wrapper.find('[class~="group/state-row"]').trigger('click')
    expect(wrapper.findAll('[class~="group/state-row"]')).toHaveLength(31)

    const showMore = wrapper.findAll('button').find((button) => button.text().includes('Show more'))
    expect(showMore).toBeDefined()

    await showMore!.trigger('click')
    await flushPromises()

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'values:expand',
        payload: { handle: 'value:route', maxEntries: 60 },
      }),
    )
    expect(wrapper.text()).toContain('/performance')
    expect(wrapper.findAll('[class~="group/state-row"]')).toHaveLength(61)

    wrapper.unmount()
  })

  it('renders HTML-looking strings as text without injecting DOM', () => {
    // https://github.com/vuejs/devtools/issues/696 — state strings must keep
    // textContent semantics and never be parsed as markup.
    const wrapper = mountStateEntry({
      key: 'html',
      path: ['State', 'html'],
      editable: false,
      value: {
        kind: 'string',
        value: '<img src=x onerror="window.__pwned = true"><b>bold</b>',
      },
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror="window.__pwned = true"><b>bold</b>')
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined()

    wrapper.unmount()
  })

  it('stores a value as a global variable and reports the $tempN name', async () => {
    query.mockResolvedValue({ varName: '$temp1' })

    const wrapper = mountStateEntry({
      key: 'payload',
      path: ['data', 'payload'],
      editable: false,
      value: {
        kind: 'object',
        name: 'Object',
        entries: 1,
        preview: [],
        handle: 'value:payload',
      },
    })

    await wrapper.find('[aria-label="Store state value as global variable"]').trigger('click')
    await flushPromises()

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'values:storeAsGlobal',
        payload: { handle: 'value:payload' },
      }),
    )
    expect(wrapper.text()).toContain('= $temp1')

    wrapper.unmount()
  })

  it('shows Recompute for computed entries and sends the RPC', async () => {
    // https://github.com/vuejs/devtools/issues/1041
    command.mockResolvedValue({ status: 1 })
    useDevtoolsClient().selectComponent('comp-1')

    const wrapper = mountStateEntry({
      key: 'doubled',
      path: ['setup', 'doubled'],
      editable: false,
      meta: { stateType: 'computed', stateTypeName: 'Computed' },
      value: { kind: 'number', value: 2 },
    })

    const button = wrapper.find('[aria-label="Recompute computed value"]')
    expect(button.exists()).toBe(true)

    await button.trigger('click')
    await flushPromises()

    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'values:recompute',
        payload: { componentId: 'comp-1', path: ['doubled'], sectionId: 'setup' },
      }),
    )

    wrapper.unmount()
  })

  it('hides Recompute for strings, refs, and Options API nested fields', async () => {
    // https://github.com/vuejs/devtools/issues/1041
    const stringRow = mountStateEntry({
      key: 'label',
      path: ['data', 'label'],
      editable: false,
      value: { kind: 'string', value: 'hello' },
    })
    expect(stringRow.find('[aria-label="Recompute computed value"]').exists()).toBe(false)
    stringRow.unmount()

    const refRow = mountStateEntry({
      key: 'count',
      path: ['setup', 'count'],
      editable: true,
      meta: { stateType: 'ref', stateTypeName: 'Ref' },
      value: { kind: 'number', value: 1 },
    })
    expect(refRow.find('[aria-label="Recompute computed value"]').exists()).toBe(false)
    refRow.unmount()

    const optionsComputed = mountStateEntry({
      key: 'doubled',
      path: ['computed', 'doubled'],
      editable: false,
      value: { kind: 'number', value: 4 },
    })
    expect(optionsComputed.find('[aria-label="Recompute computed value"]').exists()).toBe(true)
    optionsComputed.unmount()

    const nested = mountStateEntry({
      key: 'child',
      path: ['setup', 'payload', 'child'],
      editable: false,
      meta: { stateType: 'computed', stateTypeName: 'Computed' },
      value: { kind: 'string', value: 'nested' },
    })
    expect(nested.find('[aria-label="Recompute computed value"]').exists()).toBe(false)
    nested.unmount()
  })
})

function createPreview(size: number): ValueEntry[] {
  return Array.from({ length: size }, (_, index) => ({
    key: `field-${index}`,
    value: { kind: 'number', value: index },
  }))
}

function createObjectValue(preview: ValueEntry[]): EncodedValue {
  return {
    kind: 'object',
    name: 'Object',
    entries: 60,
    preview,
    handle: 'value:route',
  }
}

function mountStateEntry(entry: StateEntry) {
  return mount(StateEntryRow, {
    global: {
      directives: { tooltip: {} },
      stubs: { DevtoolsIcon: true },
    },
    props: { depth: 0, entry },
  })
}

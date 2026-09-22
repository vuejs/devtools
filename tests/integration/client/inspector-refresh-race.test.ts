// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import CustomInspectorPanel from '../../../packages/client/src/components/common/CustomInspectorPanel.vue'
import type {
  ComponentStateSnapshotMessage,
  CustomInspectorTreeNode,
} from '../../../packages/kit/src'

const { fetchInspectorTree, fetchInspectorState, clearExpandedValues } = vi.hoisted(() => ({
  fetchInspectorTree: vi.fn(),
  fetchInspectorState: vi.fn(),
  clearExpandedValues: vi.fn(),
}))
const connected = ref(true)
const selectedAppId = ref('a')
const runtimeVersion = ref(0)
const error = ref<string>()
const invalidations = ref<Record<string, { tree: number; state: number }>>({})
vi.mock('../../../packages/client/src/composables/devtools-client', () => ({
  useDevtoolsClient: () => ({
    apps: ref([]),
    connected,
    selectedAppId,
    runtimeVersion,
    error,
    inspectorInvalidations: invalidations,
    fetchInspectorTree,
    fetchInspectorState,
    clearExpandedValues,
    selectInspectorNode: vi.fn(),
    callInspectorAction: vi.fn(),
    callInspectorNodeAction: vi.fn(),
  }),
}))

let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  connected.value = true
  selectedAppId.value = 'a'
  runtimeVersion.value = 0
  error.value = undefined
  invalidations.value = { pinia: { tree: 0, state: 0 } }
  window.localStorage.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  fetchInspectorTree.mockResolvedValue([{ id: 'root', label: 'Root' }])
  fetchInspectorState.mockResolvedValue(snapshot('initial'))
})
afterEach(() => wrapper?.unmount())

function panel() {
  wrapper = mount(CustomInspectorPanel, {
    props: { inspector: { id: 'pinia', label: 'Pinia' } },
    global: {
      stubs: {
        Splitpanes: { template: '<div><slot /></div>' },
        Pane: { template: '<div><slot /></div>' },
        AppList: true,
        InspectorTree: true,
        InspectorState: true,
      },
    },
  })
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })
  return { promise, resolve, reject }
}
function snapshot(label: string): ComponentStateSnapshotMessage {
  return { componentId: 'root', version: 1, sections: [{ id: 'state', label, entries: [] }] }
}

describe('custom inspector request ordering', () => {
  it('keeps the latest search tree when earlier results arrive last', async () => {
    panel()
    await flushPromises()
    const first = deferred<CustomInspectorTreeNode[]>()
    const second = deferred<CustomInspectorTreeNode[]>()
    fetchInspectorTree.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    wrapper.findComponent({ name: 'InspectorTree' }).vm.$emit('update:filter', 'a')
    wrapper.findComponent({ name: 'InspectorTree' }).vm.$emit('update:filter', 'ab')
    second.resolve([{ id: 'latest', label: 'Latest' }])
    await flushPromises()
    first.resolve([{ id: 'old', label: 'Old' }])
    await flushPromises()
    expect(wrapper.findComponent({ name: 'InspectorTree' }).props('nodes')).toEqual([
      { id: 'latest', label: 'Latest' },
    ])
    expect(wrapper.findComponent({ name: 'InspectorState' }).props('selectedNodeId')).toBe('latest')
  })

  it.each(['app', 'runtime'] as const)(
    'discards a state response from the previous %s with identical inspector and node ids',
    async (change) => {
      const old = deferred<ComponentStateSnapshotMessage>()
      fetchInspectorState.mockReturnValueOnce(old.promise)
      panel()
      await flushPromises()
      fetchInspectorState.mockResolvedValue(snapshot('new context'))
      if (change === 'app') selectedAppId.value = 'b'
      else runtimeVersion.value++
      await flushPromises()
      old.resolve(snapshot('old context'))
      await flushPromises()
      expect(wrapper.findComponent({ name: 'InspectorState' }).props('state')).toEqual(
        snapshot('new context'),
      )
    },
  )

  it('ignores an older state failure while the latest refresh is still loading', async () => {
    const old = deferred<ComponentStateSnapshotMessage>()
    fetchInspectorState.mockReturnValueOnce(old.promise)
    panel()
    await flushPromises()
    const latest = deferred<ComponentStateSnapshotMessage>()
    fetchInspectorState.mockReturnValueOnce(latest.promise)
    invalidations.value = { pinia: { tree: 0, state: 1 } }
    await flushPromises()
    old.reject(new Error('obsolete failure'))
    await flushPromises()
    expect(error.value).toBeUndefined()
    expect(wrapper.findComponent({ name: 'InspectorState' }).props('loading')).toBe(true)
    latest.resolve(snapshot('latest'))
    await flushPromises()
    expect(wrapper.findComponent({ name: 'InspectorState' }).props('state')).toEqual(
      snapshot('latest'),
    )
    expect(wrapper.findComponent({ name: 'InspectorState' }).props('loading')).toBe(false)
  })

  it('does not request inspector data while disconnected and refreshes after reconnecting', async () => {
    panel()
    await flushPromises()
    fetchInspectorTree.mockClear()
    connected.value = false
    runtimeVersion.value++
    await flushPromises()
    expect(fetchInspectorTree).not.toHaveBeenCalled()
    connected.value = true
    await flushPromises()
    expect(fetchInspectorTree).toHaveBeenCalledTimes(1)
  })

  it('does not publish tree errors after unmounting', async () => {
    const pending = deferred<CustomInspectorTreeNode[]>()
    fetchInspectorTree.mockReturnValueOnce(pending.promise)
    panel().unmount()
    pending.reject(new Error('unmounted request'))
    await flushPromises()
    expect(error.value).toBeUndefined()
  })
})

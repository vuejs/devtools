// @vitest-environment happy-dom

import type { DevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import type {
  ComponentStateSnapshotMessage,
  ExpandedValueMessage,
  StateEntry,
} from '../../../packages/kit/src'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createDevtoolsState } from '../../../packages/client/src/composables/devtools-state'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

function fixture() {
  const query = vi.fn<(request: { type: string }) => Promise<unknown>>(async () => undefined)
  const selectedAppId = ref<string | undefined>('app-a')
  const selectedComponentId = ref<string | undefined>('root')
  const runtimeVersion = ref(0)
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() =>
    createDevtoolsState({
      getRpcClient: () => ({ query: query as DevtoolsRpcClient['query'] }) as DevtoolsRpcClient,
      selectedAppId,
      selectedComponentId,
      runtimeVersion,
      error: ref(),
      assertCommandSucceeded() {},
    }),
  )!
  return { ...state, query, selectedAppId, selectedComponentId, runtimeVersion }
}

function entry(path = ['data', 'payload'], handle = 'value:old'): StateEntry {
  return {
    key: path.at(-1)!,
    path,
    editable: true,
    value: { kind: 'object', name: 'Object', entries: 1, preview: [], handle },
  }
}

function expanded(value = 'expanded'): ExpandedValueMessage {
  return { handle: 'value:old', path: [], value: { kind: 'string', value } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('state expansion cache', () => {
  it('applies an expansion while the same snapshot stays selected', async () => {
    const state = fixture()
    const item = entry()
    state.query.mockResolvedValue(expanded())
    await state.expandEntryValue(item)
    expect(state.getEntryValue(item)).toEqual(expanded().value)
  })

  it.each(['component', 'app', 'runtime', 'clear', 'component-round-trip'] as const)(
    'drops a pending expansion after a %s change',
    async (change) => {
      const state = fixture()
      const item = entry()
      const response = deferred<ExpandedValueMessage>()
      state.query.mockImplementation(async (request) =>
        request.type === 'values:expand' ? response.promise : undefined,
      )
      const pending = state.expandEntryValue(item)
      if (change === 'component') state.selectedComponentId.value = 'other'
      if (change === 'app') state.selectedAppId.value = 'app-b'
      if (change === 'runtime') state.runtimeVersion.value++
      if (change === 'clear') state.clearExpandedValues()
      if (change === 'component-round-trip') {
        state.selectedComponentId.value = 'other'
        state.selectedComponentId.value = 'root'
      }
      response.resolve(expanded('stale'))
      await pending
      await nextTick()
      expect(state.expandedValues.value).toEqual({})
    },
  )

  it('invalidates expanded values and pending expansions when a new snapshot arrives', async () => {
    const state = fixture()
    const item = entry()
    const newer = entry(item.path, 'value:new')
    state.query.mockResolvedValue(expanded('old cached value'))
    await state.expandEntryValue(item)
    const response = deferred<ExpandedValueMessage>()
    const snapshot: ComponentStateSnapshotMessage = {
      componentId: 'root',
      version: 2,
      sections: [{ id: 'data', label: 'data', entries: [newer] }],
    }
    state.query.mockImplementation(async (request) =>
      request.type === 'values:expand' ? response.promise : snapshot,
    )
    // Use another expandable entry so both an existing cache and an in-flight request are checked.
    const pending = state.expandEntryValue(entry(['data', 'other']))
    await state.fetchComponentState('root', 2)
    response.resolve(expanded('stale'))
    await pending
    expect(state.getEntryValue(newer)).toEqual(newer.value)
    expect(state.expandedValues.value).toEqual({})
  })

  it('keeps dotted keys separate from nested paths', async () => {
    const state = fixture()
    const dotted = entry(['data', 'a.b'])
    const nested = entry(['data', 'a', 'b'])
    state.query.mockResolvedValue(expanded())
    await state.expandEntryValue(dotted)
    expect(state.getEntryKey(dotted)).not.toBe(state.getEntryKey(nested))
    expect(state.getEntryValue(nested)).toEqual(nested.value)
    expect(state.getEntryValue(dotted)).toEqual(expanded().value)
  })
})

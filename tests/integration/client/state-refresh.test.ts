// @vitest-environment happy-dom

import type { ComponentTreeNodeSnapshot, StateEntry } from '../../../packages/kit/src/protocol'
import type { DevtoolsRpcEventHandler } from '../../../packages/kit/src/rpc/types'
import type {
  RuntimeCommand,
  RuntimeCommandResult,
  RuntimeQuery,
} from '../../../packages/kit/src/runtime/types'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { command, query, onEvent } = vi.hoisted(() => ({
  command: vi.fn<(command: RuntimeCommand) => Promise<RuntimeCommandResult>>(),
  query: vi.fn<(query: RuntimeQuery) => Promise<unknown>>(),
  onEvent: vi.fn<(handler: DevtoolsRpcEventHandler) => () => void>(),
}))
vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({ command, query, onEvent, dispose() {} }),
}))

let module: typeof import('../../../packages/client/src/composables/devtools-client')
let emit: DevtoolsRpcEventHandler
let nodes: ComponentTreeNodeSnapshot[]
let version: number

beforeEach(async () => {
  vi.resetModules()
  version = 1
  nodes = [{ id: 'root', appId: 'app:0', name: 'Root', updatedAt: 1 }]
  onEvent.mockImplementation((handler) => {
    emit = handler
    return () => {}
  })
  command.mockResolvedValue({ status: 1 })
  query.mockImplementation(async (request) => {
    switch (request.type) {
      case 'devtools:capabilities':
        return { openInEditor: false }
      case 'apps:snapshot':
        return { apps: [{ id: 'app:0', name: 'App', componentCount: nodes.length }] }
      case 'components:treeSnapshot':
        return { appId: 'app:0', version: 1, nodes }
      case 'router:snapshot':
        return { routes: [] }
      case 'plugins:snapshot':
        return { plugins: [] }
      case 'inspectors:list':
        return { inspectors: [] }
      case 'components:stateSnapshot':
        return {
          componentId: request.payload && (request.payload as { componentId: string }).componentId,
          version,
          sections: [],
        }
      default:
        return undefined
    }
  })
  module = await import('../../../packages/client/src/composables/devtools-client')
})

afterEach(() => module.stopDevtoolsClient())

describe('client state refresh and component patches', () => {
  it('refreshes Pages after page navigation and ignores unrelated inspector events', async () => {
    module.startDevtoolsClient()
    await flushPromises()
    query.mockClear()
    const snapshot = {
      routes: [{ path: '/projects' }],
      currentRoute: { path: '/projects', matched: [{ path: '/projects' }] },
    }
    query.mockResolvedValue(snapshot)
    emit({
      type: 'inspectors:treeInvalidated',
      time: 2,
      appId: 'other',
      inspectorId: 'router-inspector:0',
    })
    emit({ type: 'inspectors:treeInvalidated', time: 2, appId: 'app:0', inspectorId: 'pinia' })
    await flushPromises()
    expect(query).not.toHaveBeenCalled()
    emit({
      type: 'inspectors:treeInvalidated',
      time: 3,
      appId: 'app:0',
      inspectorId: 'router-inspector:0',
    })
    await flushPromises()
    expect(module.useDevtoolsClient().routerSnapshot.value).toEqual(snapshot)
    expect(query).toHaveBeenCalledWith({ type: 'router:snapshot', appId: 'app:0' })
  })

  it('does not let an older navigation response overwrite the latest route', async () => {
    module.startDevtoolsClient()
    await flushPromises()
    let resolveOld!: (value: unknown) => void
    query
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce({ routes: [], currentRoute: { path: '/performance' } })
    const event = {
      type: 'inspectors:treeInvalidated' as const,
      time: 2,
      appId: 'app:0',
      inspectorId: 'router-inspector:0',
    }
    emit(event)
    emit(event)
    await flushPromises()
    resolveOld({ routes: [], currentRoute: { path: '/projects' } })
    await flushPromises()
    expect(module.useDevtoolsClient().routerSnapshot.value.currentRoute?.path).toBe('/performance')
  })

  it('refreshes an edited component once when the command also invalidates state', async () => {
    module.startDevtoolsClient()
    await flushPromises()
    query.mockClear()
    command.mockImplementation(async () => {
      version++
      emit({
        type: 'components:stateInvalidated',
        time: 2,
        appId: 'app:0',
        componentId: 'root',
        version,
        reason: 'edit',
      })
      return { status: 1 }
    })

    const entry: StateEntry = {
      key: 'count',
      path: ['data', 'count'],
      editable: true,
      value: { kind: 'number', value: 1 },
    }
    await module.useDevtoolsClient().editComponentState(entry, 2)
    await flushPromises()

    expect(
      query.mock.calls.filter(([request]) => request.type === 'components:stateSnapshot'),
    ).toHaveLength(1)
    expect(module.useDevtoolsClient().componentState.value?.version).toBe(2)
  })

  it('removes a large subtree with a linear number of parent lookups and preserves other roots', async () => {
    let reads = 0
    nodes = Array.from({ length: 10_000 }, (_, index) => ({
      id: index ? `child:${index}` : 'root',
      appId: 'app:0',
      name: 'Node',
      updatedAt: 1,
      get parentId() {
        reads++
        return index ? 'root' : undefined
      },
    }))
    nodes.push({ id: 'other', appId: 'app:0', name: 'Other', updatedAt: 1 })
    module.startDevtoolsClient()
    await flushPromises()
    reads = 0

    emit({
      type: 'components:treePatched',
      time: 2,
      appId: 'app:0',
      version: 2,
      patches: [{ op: 'remove', id: 'root' }],
    })

    expect(module.useDevtoolsClient().components.value.map((node) => node.id)).toEqual(['other'])
    expect(reads).toBeLessThan(10_000 * 10)
  })

  it('ignores a delayed invalidation already covered by the edit response snapshot', async () => {
    await startClient()
    command.mockImplementation(async () => {
      version = 2
      return { status: 1 }
    })
    await module.useDevtoolsClient().editComponentState(countEntry(), 2)
    invalidate(2)
    await flushPromises()
    expect(stateQueries()).toHaveLength(1)
    expect(module.useDevtoolsClient().componentState.value?.version).toBe(2)
  })

  it('retries when a newer invalidation arrives while a state snapshot is in flight', async () => {
    await startClient()
    const pending = deferred<unknown>()
    query.mockImplementationOnce(() => pending.promise)
    invalidate(2)
    version = 4
    invalidate(3)
    invalidate(4)
    pending.resolve({ componentId: 'root', version: 2, sections: [] })
    await flushPromises()
    expect(stateQueries()).toHaveLength(2)
    expect(module.useDevtoolsClient().componentState.value?.version).toBe(4)
  })

  it('does not let a snapshot requested before an edit overwrite the edited value', async () => {
    await startClient()
    const stale = deferred<unknown>()
    query.mockImplementationOnce(() => stale.promise)
    invalidate(2)
    command.mockImplementation(async () => {
      version = 3
      invalidate(3)
      return { status: 1 }
    })
    await module.useDevtoolsClient().editComponentState(countEntry(), 3)
    stale.resolve({ componentId: 'root', version: 2, sections: [] })
    await flushPromises()
    expect(module.useDevtoolsClient().componentState.value?.version).toBe(3)
    expect(stateQueries()).toHaveLength(2)
  })

  it('restores an in-flight refresh when an edit fails and ignores its stale response', async () => {
    await startClient()
    const pending = deferred<unknown>()
    query.mockImplementationOnce(() => pending.promise)
    version = 2
    invalidate(2)
    command.mockResolvedValueOnce({ status: 0, error: 'Read only' })

    const client = module.useDevtoolsClient()
    await expect(client.editComponentState(countEntry(), 3)).rejects.toThrow('Read only')
    expect(stateQueries()).toHaveLength(2)
    expect(client.componentState.value?.version).toBe(2)

    pending.resolve({ componentId: 'root', version: 1, sections: [] })
    await flushPromises()
    expect(client.componentState.value?.version).toBe(2)
    expect(client.componentStateLoading.value).toBe(false)
    expect(client.error.value).toBe('Read only')
  })

  it('refreshes once after overlapping edits have both finished', async () => {
    await startClient()
    const first = deferred<RuntimeCommandResult>()
    const second = deferred<RuntimeCommandResult>()
    command.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const client = module.useDevtoolsClient()
    const edits = [
      client.editComponentState(countEntry(), 2),
      client.editComponentState(countEntry(), 3),
    ]
    version = 2
    invalidate(2)
    first.resolve({ status: 1 })
    await flushPromises()
    expect(stateQueries()).toHaveLength(0)
    version = 3
    invalidate(3)
    second.resolve({ status: 1 })
    await Promise.all(edits)
    expect(stateQueries()).toHaveLength(1)
    expect(client.componentState.value?.version).toBe(3)
  })

  it('drops pending results when switching components or stopping the client', async () => {
    await startClient()
    const stale = deferred<unknown>()
    query.mockImplementationOnce(() => stale.promise)
    invalidate(2)
    const client = module.useDevtoolsClient()
    client.selectedComponentId.value = 'other'
    await flushPromises()
    stale.resolve({ componentId: 'root', version: 100, sections: [] })
    await flushPromises()
    expect(client.componentState.value?.componentId).toBe('other')

    const stopped = deferred<unknown>()
    query.mockImplementationOnce(() => stopped.promise)
    emit({
      type: 'components:stateInvalidated',
      appId: 'app:0',
      componentId: 'other',
      version: 2,
      time: 2,
    })
    module.stopDevtoolsClient()
    stopped.resolve({ componentId: 'other', version: 2, sections: [] })
    await flushPromises()
    expect(client.componentState.value).toBeUndefined()
    expect(client.componentStateLoading.value).toBe(false)
  })

  it('does not refresh another app and can recover after an edit fails', async () => {
    await startClient()
    invalidate(2, 'another-app')
    expect(stateQueries()).toHaveLength(0)
    command.mockResolvedValueOnce({ status: 0, error: 'Read only' })
    await expect(module.useDevtoolsClient().editComponentState(countEntry(), 2)).rejects.toThrow(
      'Read only',
    )
    command.mockImplementation(async () => {
      version = 2
      invalidate(2)
      return { status: 1 }
    })
    await module.useDevtoolsClient().editComponentState(countEntry(), 2)
    expect(stateQueries()).toHaveLength(1)
    expect(module.useDevtoolsClient().componentState.value?.version).toBe(2)
  })
})

async function startClient() {
  module.startDevtoolsClient()
  await flushPromises()
  query.mockClear()
}

function stateQueries() {
  return query.mock.calls.filter(([request]) => request.type === 'components:stateSnapshot')
}

function invalidate(version: number, appId = 'app:0') {
  emit({
    type: 'components:stateInvalidated',
    appId,
    componentId: 'root',
    version,
    time: version,
    reason: 'update',
  })
}

function countEntry(): StateEntry {
  return {
    key: 'count',
    path: ['data', 'count'],
    editable: true,
    value: { kind: 'number', value: 1 },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// @vitest-environment happy-dom

import type { ComponentInspectionResultMessage } from '../../../packages/kit/src/protocol'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { query, call } = vi.hoisted(() => ({ query: vi.fn(), call: vi.fn() }))
vi.mock('@vue/devtools-kit/client', async (importOriginal) => ({
  ...(await importOriginal()),
  connectDevtoolsClient: () => ({
    query,
    command: vi.fn(async () => ({ status: 1 })),
    onEvent: () => () => {},
    dispose() {},
  }),
}))
vi.mock('../../../packages/client/src/composables/devtools-connection', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../../packages/client/src/composables/devtools-connection')
    >()
  return {
    createDevtoolsConnection: (...args: Parameters<typeof original.createDevtoolsConnection>) => ({
      ...original.createDevtoolsConnection(...args),
      getViteRpcClient: async () => ({ call }),
    }),
  }
})

let clientModule: typeof import('../../../packages/client/src/composables/devtools-client')
let result: ComponentInspectionResultMessage
let openInEditor: boolean
let wrapper: ReturnType<typeof shallowMount> | undefined

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  openInEditor = true
  result = {
    appId: 'app:0',
    componentId: 'root',
    source: { file: 'src/Root.vue', line: 12, column: 0 },
  }
  query.mockImplementation(async ({ type, appId }: { type: string; appId?: string }) => {
    switch (type) {
      case 'devtools:capabilities':
        return { openInEditor }
      case 'apps:snapshot':
        return { apps: [{ id: 'app:0', name: 'App', componentCount: 2 }] }
      case 'components:treeSnapshot':
        return {
          appId,
          version: 1,
          nodes: [
            {
              id: 'root',
              appId: 'app:0',
              name: 'Root',
              file: '/project/src/Root.vue',
              updatedAt: 1,
            },
            {
              id: 'other',
              appId: 'app:0',
              name: 'Other',
              file: '/project/src/Other.vue',
              updatedAt: 1,
            },
          ],
        }
      case 'components:inspect':
        return result
      case 'router:snapshot':
        return { routes: [] }
      case 'plugins:snapshot':
        return { plugins: [] }
      case 'inspectors:list':
        return { inspectors: [] }
      case 'components:stateSnapshot':
        return { componentId: 'root', version: 1, sections: [] }
    }
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  clientModule = await import('../../../packages/client/src/composables/devtools-client')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clientModule.stopDevtoolsClient()
})

async function start() {
  clientModule.startDevtoolsClient()
  await flushPromises()
  return clientModule.useDevtoolsClient()
}

async function mountPage() {
  const { default: Components } = await import('../../../packages/client/src/pages/components.vue')
  wrapper = shallowMount(Components, {
    global: { renderStubDefaultSlot: true, directives: { tooltip: {} } },
  })
  await flushPromises()
  return wrapper
}

describe('component template source', () => {
  it('displays and opens the inspected position using one-based editor columns', async () => {
    const client = await start()
    const page = await mountPage()
    await client.inspectComponentInPage()
    await flushPromises()

    expect(page.text()).toContain('src/Root.vue:12:1')
    const state = page.findComponent({ name: 'InspectorState' })
    const actions = state.props('nodeActions')
    state.vm.$emit(
      'node-action',
      actions.findIndex(
        (action: { ariaLabel: string }) => action.ariaLabel === 'Open component source in editor',
      ),
    )
    await flushPromises()
    expect(call).toHaveBeenCalledWith('vite:core:open-in-editor', 'src/Root.vue:12:1')
  })

  it('falls back to the component file when a subsequent inspection has no source', async () => {
    const client = await start()
    await client.inspectComponentInPage()
    result = { appId: 'app:0', componentId: 'root' }
    await client.inspectComponentInPage()
    expect(client.selectedComponentSource.value).toBeUndefined()
    await client.openSelectedComponentInEditor()
    expect(call).toHaveBeenCalledWith('vite:core:open-in-editor', '/project/src/Root.vue')
  })

  it('clears the position when selecting another component', async () => {
    const client = await start()
    await client.inspectComponentInPage()
    client.selectComponent('other')
    expect(client.selectedComponentSource.value).toBeUndefined()
    await client.openSelectedComponentInEditor()
    expect(call).toHaveBeenCalledWith('vite:core:open-in-editor', '/project/src/Other.vue')
  })

  it('clears the position on an app switch and runtime reset', async () => {
    const client = await start()
    await client.inspectComponentInPage()
    client.selectApp('other-app')
    expect(client.selectedComponentSource.value).toBeUndefined()
    await flushPromises()
    await client.inspectComponentInPage()
    expect(client.selectedComponentSource.value).toEqual(result.source)
    client.runtimeVersion.value++
    expect(client.selectedComponentSource.value).toBeUndefined()
  })

  it('ignores inspection results from a previous runtime', async () => {
    const client = await start()
    let resolve!: (value: ComponentInspectionResultMessage) => void
    query.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const inspection = client.inspectComponentInPage()
    client.runtimeVersion.value++
    resolve(result)
    await expect(inspection).resolves.toBeUndefined()
    expect(client.selectedComponentSource.value).toBeUndefined()
  })

  it('shows the position without an editor action when the host capability is disabled', async () => {
    openInEditor = false
    const client = await start()
    const page = await mountPage()
    await client.inspectComponentInPage()
    await flushPromises()
    expect(page.text()).toContain('src/Root.vue:12:1')
    expect(page.findComponent({ name: 'InspectorState' }).props('nodeActions')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ariaLabel: 'Open component source in editor' }),
      ]),
    )
    await client.openSelectedComponentInEditor()
    expect(call).not.toHaveBeenCalled()
  })
})

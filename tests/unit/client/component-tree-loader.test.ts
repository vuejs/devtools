import { describe, expect, it, vi } from 'vitest'
import type {
  ComponentTreePageMessage,
  ComponentTreePatch,
} from '../../../packages/kit/src/protocol'
import type { DevtoolsRpcClient } from '../../../packages/kit/src/rpc/client'
import { createComponentTreeLoader } from '../../../packages/client/src/composables/component-tree-loader'

function setup(getParentId?: (id: string) => string | undefined) {
  let appId = 'app:0'
  let reply!: (page: ComponentTreePageMessage) => void
  const query = vi.fn(
    () =>
      new Promise<ComponentTreePageMessage>((resolve) => {
        reply = resolve
      }),
  )
  const command = vi.fn(async () => ({ status: 1 }))
  const client = { query, command } as unknown as DevtoolsRpcClient
  const apply = vi.fn()
  const onError = vi.fn()
  const loader = createComponentTreeLoader({
    getClient: () => client,
    getAppId: () => appId,
    getParentId,
    apply,
    onError,
  })
  return {
    loader,
    query,
    command,
    apply,
    onError,
    reply: (page: ComponentTreePageMessage) => reply(page),
    selectApp: (id: string) => {
      appId = id
    },
  }
}

const node = { id: 'child', appId: 'app:0', parentId: 'root', name: 'Child', updatedAt: 1 }

describe('progressive tree loader', () => {
  it('discards a pending page after switching apps', async () => {
    const test = setup()
    const pending = test.loader.expand('root')
    test.selectApp('app:1')
    test.reply({ nodes: [node], cursor: '1:1' })
    await pending
    expect(test.apply).not.toHaveBeenCalled()
    expect(test.command).toHaveBeenCalledTimes(1)
  })

  it('reports a failed query and allows retrying the expansion', async () => {
    const test = setup()
    test.query.mockRejectedValueOnce(new Error('connection interrupted'))
    await test.loader.expand('root')
    expect(test.onError).toHaveBeenCalledTimes(1)
    const retry = test.loader.expand('root')
    test.reply({ nodes: [node] })
    await retry
    expect(test.apply).toHaveBeenCalledTimes(1)
  })

  it('cancels descendant requests when an ancestor is collapsed', async () => {
    const test = setup((id) => (id === 'child' ? 'root' : undefined))
    const pending = test.loader.expand('child')
    test.loader.cancel('root')
    test.reply({ nodes: [node], cursor: '1:1' })
    await pending
    expect(test.apply).not.toHaveBeenCalled()
    expect(test.command).toHaveBeenCalledTimes(1)
  })

  it('replays live removals after an older page instead of resurrecting nodes', async () => {
    const test = setup()
    const pending = test.loader.expand('root')
    const remove: ComponentTreePatch = { op: 'remove', id: 'child' }
    test.loader.observe([remove])
    test.reply({ nodes: [node] })
    await pending
    expect(test.apply).toHaveBeenCalledWith([{ op: 'insert', parentId: 'root', node }, remove])
  })

  it('ignores replies after collapse and releases their cursor', async () => {
    const test = setup()
    const pending = test.loader.expand('root')
    test.loader.cancel('root')
    test.reply({ nodes: [node], cursor: '1:1' })
    await pending
    expect(test.apply).not.toHaveBeenCalled()
    expect(test.command).toHaveBeenCalledWith({
      type: 'components:cancelTreeChildren',
      appId: 'app:0',
      payload: { cursor: '1:1' },
    })
  })

  it('coalesces duplicate expands but permits a fresh request after cancellation', async () => {
    const test = setup()
    const first = test.loader.expand('root')
    expect(test.loader.expand('root')).toBe(first)
    test.loader.cancel()
    test.reply({ nodes: [] })
    await first
    const next = test.loader.expand('root')
    test.reply({ nodes: [node] })
    await next
    expect(test.query).toHaveBeenCalledTimes(2)
    expect(test.apply).toHaveBeenCalledTimes(1)
  })
})

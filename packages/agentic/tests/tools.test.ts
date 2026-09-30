import { describe, expect, it, vi } from 'vitest'
import { createVueDevtoolsAgentTools } from '../src'

const page = { id: 'document-1', url: 'http://localhost:5173/', title: 'App' }

function setup(result?: unknown) {
  const query = vi.fn().mockResolvedValue(result)
  return { query, tools: createVueDevtoolsAgentTools({ query }, page) }
}

describe('Vue agent tools', () => {
  it('routes state queries to the explicit app and preserves encoded values', async () => {
    const state = { sections: [{ entries: [{ key: 'secret', value: { type: 'undefined' } }] }] }
    const { query, tools } = setup(state)
    expect(await tools['component-state'].handler({ appId: 'app-2', componentId: '2:1' })).toEqual({
      page,
      capturedAt: expect.any(Number),
      result: state,
    })
    expect(query).toHaveBeenCalledWith({
      type: 'components:stateSnapshot',
      appId: 'app-2',
      payload: { componentId: '2:1', maxEntries: 50 },
    })
  })

  it('rejects missing app IDs, excessive reads and unknown arguments before querying', async () => {
    const { query, tools } = setup()
    await expect(
      tools['component-state'].handler({ appId: '', componentId: '1', maxEntries: 201 }),
    ).rejects.toThrow()
    await expect(
      tools['router-state'].handler({ appId: 'a', command: 'components:editState' } as never),
    ).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('preserves pagination and converts missing results to JSON null', async () => {
    const { query, tools } = setup()
    expect(
      (await tools['component-children'].handler({ appId: 'a', componentId: 'c', cursor: 'next' }))
        .result,
    ).toBeNull()
    expect(query).toHaveBeenCalledWith({
      type: 'components:treeChildren',
      appId: 'a',
      payload: { componentId: 'c', cursor: 'next' },
    })
  })

  it('exposes only read queries and distinct page identity', async () => {
    const { tools } = setup({ apps: [] })
    expect(
      Object.values(tools).every((tool) => tool.type === 'query' && tool.agent.safety === 'read'),
    ).toBe(true)
    expect((await tools['list-apps'].handler()).page.id).toBe(page.id)
  })

  it('matches a component tree filter by name or file and still forwards it', async () => {
    const tree = {
      nodes: [
        { name: 'App', file: 'src/App.vue' },
        { name: 'UserList', file: 'src/users/List.vue' },
      ],
    }
    const { query, tools } = setup(tree)
    expect(
      (await tools['component-tree'].handler({ appId: 'app', filter: 'LIST.vue' })).result,
    ).toEqual({
      nodes: [tree.nodes[1]],
    })
    expect(query).toHaveBeenCalledWith({
      type: 'components:treeSnapshot',
      appId: 'app',
      payload: { filter: 'LIST.vue' },
    })
  })

  it('routes the additional read queries and cancels an abandoned cursor', async () => {
    const command = vi.fn().mockResolvedValue({ status: 1 })
    const query = vi.fn().mockResolvedValue({ ok: true })
    const tools = createVueDevtoolsAgentTools({ query, command }, page)
    expect((await tools['list-plugins'].handler()).result).toEqual({ ok: true })
    expect((await tools['runtime-health'].handler()).result).toEqual({ ok: true })
    await tools['component-render-code'].handler({ appId: 'app', componentId: '2:1' })
    await tools['router-matches'].handler({ appId: 'app', path: '/users' })
    await tools['cancel-component-children'].handler({ appId: 'app', cursor: '4:1' })
    expect(query.mock.calls.map((call) => call[0].type)).toEqual([
      'plugins:snapshot',
      'runtime:health',
      'components:getRenderCode',
      'router:matchedRoutes',
    ])
    expect(command).toHaveBeenCalledWith({
      type: 'components:cancelTreeChildren',
      appId: 'app',
      payload: { cursor: '4:1' },
    })
  })

  it('ignores cycles and non-JSON values while preserving serializable data', async () => {
    const cycle: Record<string, unknown> = { name: 'App' }
    cycle.self = cycle
    const { tools } = setup({
      nodes: [cycle],
      count: 1n,
      callback: () => {},
      symbol: Symbol('value'),
      values: [1, 1n, undefined, 2],
      shared: cycle,
      date: new Date('2026-09-30T00:00:00Z'),
    })
    const snapshot = await tools['list-plugins'].handler()
    expect(snapshot).toEqual({
      page,
      capturedAt: expect.any(Number),
      result: {
        nodes: [{ name: 'App' }],
        values: [1, null, null, 2],
        shared: { name: 'App' },
        date: '2026-09-30T00:00:00.000Z',
      },
    })
  })
})

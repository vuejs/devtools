import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVueDevtoolsAgentSession } from '../src/session'

afterEach(() => vi.useRealTimers())

describe('agent connection lifetime', () => {
  it('stays disconnected during discovery, reuses queries, and releases after the last idle period', async () => {
    vi.useFakeTimers()
    const query = vi.fn().mockResolvedValue({ apps: [] })
    const dispose = vi.fn()
    const connect = vi.fn(() => ({ query, dispose }))
    const session = createVueDevtoolsAgentSession(connect)
    expect(connect).not.toHaveBeenCalled()

    await session.query({ type: 'apps:snapshot' })
    await vi.advanceTimersByTimeAsync(20_000)
    await session.query({ type: 'apps:snapshot' })
    expect(connect).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(dispose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(dispose).toHaveBeenCalledOnce()

    await session.query({ type: 'apps:snapshot' })
    expect(connect).toHaveBeenCalledTimes(2)
    session.dispose()
    expect(dispose).toHaveBeenCalledTimes(2)
    await expect(session.query({ type: 'apps:snapshot' })).rejects.toThrow('disposed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the connection until dispose when idle release is disabled', async () => {
    vi.useFakeTimers()
    const query = vi.fn().mockResolvedValue({ apps: [] })
    const command = vi.fn().mockResolvedValue({ status: 1 })
    const dispose = vi.fn()
    const session = createVueDevtoolsAgentSession(() => ({ query, command, dispose }), {
      idleTimeoutMs: null,
    })
    await session.query({ type: 'apps:snapshot' })
    await session.command({ type: 'components:cancelTreeChildren', payload: { cursor: '1:1' } })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(dispose).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledOnce()
    expect(command).toHaveBeenCalledOnce()
    session.dispose()
    expect(dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the connection while concurrent queries are running and releases after failures', async () => {
    vi.useFakeTimers()
    let resolveQuery!: (value: { apps: [] }) => void
    let rejectQuery!: (error: Error) => void
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveQuery = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectQuery = reject
          }),
      )
    const dispose = vi.fn()
    const session = createVueDevtoolsAgentSession(() => ({ query, dispose }))
    const first = session.query({ type: 'apps:snapshot' })
    const second = session.query({ type: 'apps:snapshot' })
    const failed = expect(second).rejects.toThrow('query failed')
    resolveQuery({ apps: [] })
    await first
    await vi.advanceTimersByTimeAsync(60_000)
    expect(dispose).not.toHaveBeenCalled()
    rejectQuery(new Error('query failed'))
    await failed
    await vi.advanceTimersByTimeAsync(30_000)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('releases immediately on teardown without leaving an idle callback after a pending query', async () => {
    vi.useFakeTimers()
    let resolveQuery!: (value: { apps: [] }) => void
    const query = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve
        }),
    )
    const dispose = vi.fn()
    const session = createVueDevtoolsAgentSession(() => ({ query: query as never, dispose }))
    const result = session.query({ type: 'apps:snapshot' })
    session.dispose()
    resolveQuery({ apps: [] })
    await result
    expect(dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})

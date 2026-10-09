import { expect, it, vi } from 'vitest'
import { createVueDevtoolsAgentSession } from '../src/session'

it('connects lazily, shares the connection and disposes it once', async () => {
  const query = vi.fn().mockResolvedValue({ apps: [] })
  const command = vi.fn().mockResolvedValue({ status: 1 })
  const dispose = vi.fn()
  const connect = vi.fn(() => ({ query, command, dispose }))
  const session = createVueDevtoolsAgentSession(connect)
  expect(connect).not.toHaveBeenCalled()
  await Promise.all([
    session.query({ type: 'apps:snapshot' }),
    session.query({ type: 'apps:snapshot' }),
    session.command({ type: 'components:cancelTreeChildren', payload: { cursor: '1:1' } }),
  ])
  expect(connect).toHaveBeenCalledOnce()
  expect(command).toHaveBeenCalledOnce()
  expect(dispose).not.toHaveBeenCalled()
  session.dispose()
  session.dispose()
  expect(dispose).toHaveBeenCalledOnce()
  await expect(session.query({ type: 'apps:snapshot' })).rejects.toThrow('disposed')
})

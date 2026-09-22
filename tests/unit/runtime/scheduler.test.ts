import { afterEach, expect, it, vi } from 'vitest'
import { createRuntimeScheduler } from '../../../packages/kit/src/runtime/scheduler'

afterEach(() => vi.useRealTimers())

it('yields between batches while flush waits for all tasks', async () => {
  vi.useFakeTimers()
  const scheduler = createRuntimeScheduler()
  const calls: number[] = []
  vi.spyOn(performance, 'now').mockImplementation(() => calls.length)
  for (let i = 0; i < 250; i++)
    scheduler.schedule(
      String(i),
      () => {
        calls.push(i)
      },
      120,
    )
  const flushed = scheduler.flush()
  await Promise.resolve()
  expect(calls).toHaveLength(4)
  await vi.runAllTimersAsync()
  await flushed
  expect(calls).toEqual(Array.from({ length: 250 }, (_, i) => i))
})

it('cancels the remainder of a yielded batch and permits fresh work', async () => {
  vi.useFakeTimers()
  const scheduler = createRuntimeScheduler()
  const stale = vi.fn()
  vi.spyOn(performance, 'now').mockImplementation(() => stale.mock.calls.length)
  for (let i = 0; i < 250; i++) scheduler.schedule(String(i), stale, 120)
  const flushed = scheduler.flush()
  await Promise.resolve()
  scheduler.clear()
  const fresh = vi.fn()
  scheduler.schedule('fresh', fresh, 120)
  await vi.runAllTimersAsync()
  await flushed
  expect(stale).toHaveBeenCalledTimes(4)
  expect(fresh).toHaveBeenCalledOnce()
})

it('does not yield solely because many inexpensive tasks were queued', async () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const scheduler = createRuntimeScheduler()
  const task = vi.fn()
  for (let i = 0; i < 250; i++) scheduler.schedule(String(i), task, 120)
  await scheduler.flush()
  expect(task).toHaveBeenCalledTimes(250)
  expect(vi.getTimerCount()).toBe(0)
})

it('flushes reentrant work once and preserves coalescing', async () => {
  const scheduler = createRuntimeScheduler()
  const calls: string[] = []
  scheduler.schedule('first', () => {
    calls.push('first')
    scheduler.schedule('next', () => {
      calls.push('stale')
    })
    scheduler.schedule('next', () => {
      calls.push('latest')
    })
  })
  await scheduler.flush()
  await scheduler.flush()
  expect(calls).toEqual(['first', 'latest'])
})

import type { MaybePromise } from './types'

export interface RuntimeScheduler {
  schedule(key: string, task: () => MaybePromise<void>, delayMs?: number): boolean
  flush(): Promise<void>
  clear(): void
}

export function createRuntimeScheduler(): RuntimeScheduler {
  const tasks = new Map<string, () => MaybePromise<void>>()
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let generation = 0

  function run(): Promise<void> {
    if (running) return running.then(() => (tasks.size ? run() : undefined))
    pending = false
    if (timer) clearTimeout(timer)
    timer = undefined
    const batch = [...tasks.values()]
    tasks.clear()
    const batchGeneration = generation
    running = Promise.resolve()
      .then(async () => {
        const results: Promise<{ error: unknown } | undefined>[] = []
        let started = performance.now()
        for (const task of batch) {
          if (batchGeneration !== generation) break
          // Attach rejection handlers immediately while other work is yielded.
          try {
            results.push(
              Promise.resolve(task()).then(
                () => undefined,
                (error) => ({ error }),
              ),
            )
          } catch (error) {
            results.push(Promise.resolve({ error }))
          }
          if (performance.now() - started >= 4) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
            started = performance.now()
          }
        }
        const settled = await Promise.all(results)
        const failure = settled.find((result) => result !== undefined)
        if (failure) throw failure.error
      })
      .finally(() => {
        running = undefined
      })
    return running
  }

  return {
    schedule(key, task, delayMs = 0) {
      const coalesced = tasks.has(key)
      tasks.set(key, task)
      if (!pending) {
        pending = true
        if (delayMs > 0) timer = setTimeout(() => void run(), delayMs)
        else queueMicrotask(() => void run())
      }
      return coalesced
    },
    flush: run,
    clear() {
      generation++
      if (timer) clearTimeout(timer)
      timer = undefined
      tasks.clear()
      pending = false
    },
  }
}

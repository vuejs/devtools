import type { ComponentTreePatch } from '@vue/devtools-kit'
import type { DevtoolsRpcClient } from '@vue/devtools-kit/client'

interface TreeLoaderOptions {
  getClient(): DevtoolsRpcClient | undefined
  getAppId(): string | undefined
  getParentId?(componentId: string): string | undefined
  apply(patches: ComponentTreePatch[]): void
  onError(error: unknown): void
}

interface ExpansionJob {
  cancelled: boolean
  events: ComponentTreePatch[]
  promise?: Promise<void>
}

export function createComponentTreeLoader(options: TreeLoaderOptions) {
  const jobs = new Map<string, ExpansionJob>()

  function cancel(componentId?: string) {
    for (const [id, job] of jobs) {
      if (componentId) {
        let ancestor: string | undefined = id
        const visited = new Set<string>()
        while (ancestor && ancestor !== componentId && !visited.has(ancestor)) {
          visited.add(ancestor)
          ancestor = options.getParentId?.(ancestor)
        }
        if (ancestor !== componentId) continue
      }
      job.cancelled = true
      jobs.delete(id)
    }
  }

  function observe(patches: ComponentTreePatch[]) {
    // A live removal/update can overtake a query reply. Replay it after that
    // page so an older snapshot cannot resurrect a removed node or stale state.
    for (const job of jobs.values()) job.events.push(...patches)
  }

  function expand(componentId: string): Promise<void> {
    const existing = jobs.get(componentId)
    if (existing?.promise) return existing.promise
    const client = options.getClient()
    const appId = options.getAppId()
    if (!client || !appId) return Promise.resolve()
    const job: ExpansionJob = { cancelled: false, events: [] }
    jobs.set(componentId, job)
    job.promise = run()
    return job.promise

    async function run() {
      let cursor: string | undefined
      try {
        do {
          job.events = []
          const page = await client!.query({
            type: 'components:treeChildren',
            appId,
            payload: { componentId, cursor },
          })
          cursor = page.cursor
          if (job.cancelled || options.getAppId() !== appId || options.getClient() !== client) break
          options.apply([
            ...page.nodes.map((node): ComponentTreePatch => ({
              op: 'insert',
              parentId: node.parentId,
              node,
            })),
            ...job.events,
          ])
          if (cursor) await yieldToBrowser()
        } while (cursor && !job.cancelled)
      } catch (error) {
        if (!job.cancelled) options.onError(error)
      } finally {
        if (jobs.get(componentId) === job) jobs.delete(componentId)
        if (cursor) {
          await client!
            .command({
              type: 'components:cancelTreeChildren',
              appId,
              payload: { cursor },
            })
            .catch(() => {})
        }
      }
    }
  }

  return { expand, cancel, observe }
}

async function yieldToBrowser(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield(): Promise<void> }
    }
  ).scheduler
  if (scheduler?.yield) return scheduler.yield()
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

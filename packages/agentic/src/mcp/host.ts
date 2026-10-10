import type { DevframeNodeContext } from 'devframe/types'

/** Prime the host agent surface so its automatic MCP route exists before the page connects. */
export function registerVueDevtoolsAgentHost(ctx: Pick<DevframeNodeContext, 'agent'>): () => void {
  const handle = ctx.agent.registerTool({
    id: 'vue-devtools:agent:help',
    description:
      'Explain how to discover Vue runtime tools. Call if Vue page tools are missing or to understand page selection.',
    safety: 'read',
    handler: () => ({
      instructions:
        'Open the application in a browser and allow the Vite DevTools connection. List tools again to discover page-specific Vue tools. Each page has a unique namespace; use list-apps to identify its URL and app IDs before querying. Use component-value or inspector-value for a known field path; edit tools are explicit actions and return the value read after the command. Reloading the page invalidates its old namespace, component IDs and value handles. Paging: start at page 1, then pass the returned snapshotId and pagination.next as page, keeping pageSize and the target unchanged, until next is null. Pages can hold fewer than pageSize entries to fit the response budget. A batch keeps field order but is not an atomic snapshot of live values. Restart without snapshotId if it expires.',
    }),
  })
  return () => handle.unregister()
}

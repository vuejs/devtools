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
        'Open the application in a browser and allow the Vite DevTools connection. List tools again to discover page-specific Vue tools. Each page has a unique namespace; use list-apps to identify its URL and app IDs before querying. Reloading the page invalidates its old namespace, component IDs and value handles.',
    }),
  })
  return () => handle.unregister()
}

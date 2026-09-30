import { z } from 'zod'
import { configure } from 'safe-stable-stringify'
import type {
  VueDevtoolsAgentConnection,
  VueDevtoolsAgentPage,
  VueDevtoolsAgentSnapshot,
} from '../types'

const stringify = configure({ bigint: false, circularValue: undefined, deterministic: false })

export function createVueDevtoolsAgentTools(
  connection: VueDevtoolsAgentConnection,
  page: VueDevtoolsAgentPage,
) {
  const appId = z.string().min(1)
  const target = z.strictObject({ appId })
  const component = target.extend({ componentId: z.string().min(1) })
  const inspector = target.extend({ inspectorId: z.string().min(1) })
  const maxEntries = z.number().int().min(1).max(200).default(50)

  function tool<S extends z.ZodType>(
    description: string,
    schema: S,
    handler: (input: z.output<S>) => Promise<unknown>,
  ) {
    return {
      type: 'query' as const,
      jsonSerializable: true as const,
      args: [schema] as [S],
      agent: { description, safety: 'read' as const },
      async handler(input: z.input<S>) {
        const result = await handler(schema.parse(input))
        return toSnapshot(page, result)
      },
    }
  }

  const listApps = tool(
    'Identify this page and list its Vue apps. Call before inspecting an app. IDs and value handles belong to this document and expire on reload. page.url follows the document location; use router-state for the Vue route.',
    z.strictObject({}),
    () => connection.query({ type: 'apps:snapshot' }),
  )
  const listPlugins = tool(
    'List Vue DevTools plugins registered on this page, including their settings.',
    z.strictObject({}),
    () => connection.query({ type: 'plugins:snapshot' }),
  )
  const runtimeHealth = tool(
    'Read whether the Vue runtime is collecting and a small performance snapshot. Use this when component data looks empty or stalled.',
    z.strictObject({}),
    () => connection.query({ type: 'runtime:health' }),
  )

  return {
    'list-apps': { ...listApps, args: [], handler: () => listApps.handler({}) },
    'list-plugins': { ...listPlugins, args: [], handler: () => listPlugins.handler({}) },
    'runtime-health': { ...runtimeHealth, args: [], handler: () => runtimeHealth.handler({}) },
    'component-tree': tool(
      'List the initially expanded Vue component tree and source files. filter matches component name or source file on the returned nodes and is also forwarded to plugin tree hooks. The tree can be partial; use component-children for childCount and cursors. Calling this again drops those cursors.',
      target.extend({ filter: z.string().max(200).optional() }),
      async ({ appId, filter }) => {
        const snapshot = await connection.query({
          type: 'components:treeSnapshot',
          appId,
          payload: filter ? { filter } : {},
        })
        return filterTree(snapshot, filter)
      },
    ),
    'component-children': tool(
      'Read one page of a component’s children. Pass the returned cursor to read the next page in the same app and document. Calling component-tree again drops open cursors. Use cancel-component-children to drop a cursor you will not finish.',
      component.extend({ cursor: z.string().min(1).optional() }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'components:treeChildren', appId, payload }),
    ),
    'cancel-component-children': tool(
      'Drop a component-children cursor that will not be read again.',
      component.extend({ cursor: z.string().min(1) }).omit({ componentId: true }),
      ({ appId, cursor }) => {
        if (!connection.command) throw new Error('This host cannot cancel component expansion')
        return connection.command({
          type: 'components:cancelTreeChildren',
          appId,
          payload: { cursor },
        })
      },
    ),
    'component-state': tool(
      'Inspect a component’s props, setup state, computed values and available reactivity graph. Values use the Vue DevTools codec; partial sections and handles require follow-up reads. Dependency relationships alone do not prove a specific update cause.',
      component.extend({ maxEntries }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'components:stateSnapshot', appId, payload }),
    ),
    'list-inspectors': tool(
      'List plugin inspectors, including Pinia when registered. Use inspector-tree and inspector-state to inspect stores or other plugin data.',
      target,
      ({ appId }) => connection.query({ type: 'inspectors:list', appId }),
    ),
    'inspector-tree': tool(
      'Find nodes in a plugin inspector, such as Pinia stores. Use inspector IDs from list-inspectors. filter is interpreted by that plugin, not as a plain name search.',
      inspector.extend({ filter: z.string().max(200).optional() }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'inspectors:treeSnapshot', appId, payload }),
    ),
    'inspector-state': tool(
      'Read state of an inspector node, such as a Pinia store. Use node IDs from inspector-tree. State may contain private application data.',
      inspector.extend({ nodeId: z.string().min(1) }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'inspectors:stateSnapshot', appId, payload }),
    ),
    'component-render-code': tool(
      'Read the render function source for one component, when the runtime can recover it.',
      component,
      ({ appId, componentId }) =>
        connection.query({ type: 'components:getRenderCode', appId, payload: { componentId } }),
    ),
    'router-state': tool(
      'Inspect the app’s current route and registered routes to diagnose navigation and matched components.',
      target,
      ({ appId }) => connection.query({ type: 'router:snapshot', appId }),
    ),
    'router-matches': tool(
      'Match a path against the app router without navigating. Use router-state for the current route.',
      target.extend({ path: z.string().min(1).max(2000) }),
      ({ appId, path }) =>
        connection.query({ type: 'router:matchedRoutes', appId, payload: { path } }),
    ),
    'expand-value': tool(
      'Expand an encoded value handle from a previous state or inspector query in this app and document. Read only the necessary path. Handles expire on reload, when this page’s agent connection is disposed, and after the value they point at changes.',
      target.extend({
        handle: z.string().min(1),
        path: z.array(z.string()).max(20).optional(),
        maxEntries,
      }),
      ({ appId, ...payload }) => connection.query({ type: 'values:expand', appId, payload }),
    ),
  }
}

function filterTree(snapshot: unknown, filter: string | undefined): unknown {
  if (!filter || !snapshot || typeof snapshot !== 'object' || !('nodes' in snapshot))
    return snapshot
  const nodes = (snapshot as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return snapshot
  const needle = filter.toLowerCase()
  return {
    ...snapshot,
    nodes: nodes.filter((node) => {
      if (!node || typeof node !== 'object') return false
      const record = node as { name?: unknown; file?: unknown }
      return [record.name, record.file].some(
        (value) => typeof value === 'string' && value.toLowerCase().includes(needle),
      )
    }),
  }
}

function toSnapshot(page: VueDevtoolsAgentPage, result: unknown): VueDevtoolsAgentSnapshot {
  return {
    page: toJson(page) as VueDevtoolsAgentPage,
    capturedAt: Date.now(),
    result: toJson(result) ?? null,
  }
}

function toJson(value: unknown): unknown {
  return JSON.parse(stringify(value) ?? 'null')
}

import type { RuntimeCommandRequest, StateValueMessage } from '@vue/devtools-kit'
import { z } from 'zod'
import { resultSchemas, snapshotSchema } from './schemas'
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
  const pagination = {
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(500).default(50),
    snapshotId: z.string().min(1).optional(),
  }
  const pagingGuide =
    ' To read all entries, start at page 1, then pass the returned snapshotId and pagination.next as page, keeping pageSize and the target unchanged, until next is null. Pages can contain fewer than pageSize entries to fit the response budget. The batch retains field order, not an atomic snapshot of live values. Restart without snapshotId if it expires.'

  function tool<S extends z.ZodType>(
    description: string,
    schema: S,
    handler: (input: z.output<S>) => Promise<unknown>,
    resultSchema: z.ZodType,
    kind: 'query' | 'action' = 'query',
  ) {
    return {
      type: kind,
      jsonSerializable: true as const,
      args: [schema] as [S],
      returns: snapshotSchema(resultSchema),
      agent: { description, safety: kind === 'query' ? ('read' as const) : ('action' as const) },
      async handler(input: z.input<S>) {
        const result = await handler(schema.parse(input))
        return toSnapshot(page, result)
      },
    }
  }

  const field = z.object({
    sectionId: z.string().min(1),
    path: z
      .array(
        z
          .string()
          .refine(
            (segment) => !['__proto__', 'prototype', 'constructor'].includes(segment),
            'Unsafe state path',
          ),
      )
      .min(1)
      .max(20),
  })
  const componentField = component.extend(field.shape)
  const inspectorField = inspector.extend({ nodeId: z.string().min(1), ...field.shape })

  async function editField(command: RuntimeCommandRequest, read: () => Promise<StateValueMessage>) {
    if (!connection.command) throw new Error('This host does not support state editing')
    const before = await read()
    if (!before.found)
      throw new Error(
        'State path was not found. Read the current component or inspector state and correct the path before editing.',
      )
    if (!before.editable)
      throw new Error('State field is read-only. Choose an editable field from the current state.')
    const result = await connection.command(command)
    if (result.status !== 1)
      throw new Error(
        `State edit failed: ${stringify(result.error) ?? 'the runtime rejected the edit'}`,
      )
    try {
      return { status: 1 as const, state: await read() }
    } catch (error) {
      throw new Error(
        `The edit command completed, but reading back the value failed. Inspect the state before retrying the edit. ${String(error)}`,
      )
    }
  }

  const listApps = tool(
    'Identify this page and list its Vue apps. Call before inspecting an app. IDs and value handles belong to this document and expire on reload. page.url follows the document location; use router-state for the Vue route.',
    z.strictObject({}),
    () => connection.query({ type: 'apps:snapshot' }),
    resultSchemas.apps,
  )
  const listPlugins = tool(
    'List Vue DevTools plugins registered on this page, including their settings.',
    z.strictObject({}),
    () => connection.query({ type: 'plugins:snapshot' }),
    resultSchemas.plugins,
  )
  const runtimeHealth = tool(
    'Read whether the Vue runtime is collecting and a small performance snapshot. Use this when component data looks empty or stalled.',
    z.strictObject({}),
    () => connection.query({ type: 'runtime:health' }),
    resultSchemas.health,
  )

  return {
    'list-apps': { ...listApps, args: [], handler: () => listApps.handler({}) },
    'list-plugins': { ...listPlugins, args: [], handler: () => listPlugins.handler({}) },
    'runtime-health': { ...runtimeHealth, args: [], handler: () => runtimeHealth.handler({}) },
    'component-tree': tool(
      'List the initially expanded Vue component tree and source files. filter matches component name or source file on the returned nodes and is also forwarded to plugin tree hooks. The tree can be partial; use component-children for childCount and cursors. If a cursor expires, restart component-children for that component.',
      target.extend({ filter: z.string().max(200).optional() }),
      async ({ appId, filter }) => {
        const snapshot = await connection.query({
          type: 'components:treeSnapshot',
          appId,
          payload: filter ? { filter } : {},
        })
        return filterTree(snapshot, filter)
      },
      resultSchemas.tree,
    ),
    'component-children': tool(
      'Read one page of a component’s children. Pass the returned cursor to read the next page in the same app and document. If a cursor expires, restart without it. Use cancel-component-children to drop a cursor you will not finish.',
      component.extend({ cursor: z.string().min(1).optional() }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'components:treeChildren', appId, payload }),
      resultSchemas.children,
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
      resultSchemas.command,
    ),
    'component-state': tool(
      'Read a page of component state, grouped by section. pagination.total counts top-level fields across all sections. Objects and arrays preview 30 entries; use expand-value to page through their contents, or component-value for a known field path. A null result means the component was not found.' +
        pagingGuide,
      component.extend(pagination),
      ({ appId, ...payload }) =>
        connection.query({ type: 'components:stateSnapshot', appId, payload }),
      resultSchemas.state,
    ),
    'list-inspectors': tool(
      'List plugin inspectors, including Pinia when registered. Use inspector-tree and inspector-state to inspect stores or other plugin data.',
      target,
      ({ appId }) => connection.query({ type: 'inspectors:list', appId }),
      resultSchemas.inspectors,
    ),
    'inspector-tree': tool(
      'Find nodes in a plugin inspector, such as Pinia stores. Use inspector IDs from list-inspectors. filter is interpreted by that plugin, not as a plain name search.',
      inspector.extend({ filter: z.string().max(200).optional() }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'inspectors:treeSnapshot', appId, payload }),
      resultSchemas.inspectorTree,
    ),
    'inspector-state': tool(
      'Read a page of Inspector state, such as a Pinia store, grouped by section. pagination.total counts fields across all sections. Use node IDs from inspector-tree and inspector-value for a known path. The plugin state hook runs when starting a batch. A null result means no matching state was found.' +
        pagingGuide,
      inspector.extend({ nodeId: z.string().min(1), ...pagination }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'inspectors:stateSnapshot', appId, payload }),
      resultSchemas.state,
    ),
    'component-render-code': tool(
      'Read the render function source for one component, when the runtime can recover it.',
      component,
      ({ appId, componentId }) =>
        connection.query({ type: 'components:getRenderCode', appId, payload: { componentId } }),
      resultSchemas.renderCode,
    ),
    'router-state': tool(
      'Inspect the app’s current route and registered routes to diagnose navigation and matched components.',
      target,
      ({ appId }) => connection.query({ type: 'router:snapshot', appId }),
      resultSchemas.router,
    ),
    'router-matches': tool(
      'Match a path against the app router without navigating. Use router-state for the current route.',
      target.extend({ path: z.string().min(1).max(2000) }),
      ({ appId, path }) =>
        connection.query({ type: 'router:matchedRoutes', appId, payload: { path } }),
      resultSchemas.matches,
    ),
    'component-value': tool(
      'Read a known field in a built-in component state section without a snapshot or handle, including fields outside the current page. Get sectionId from component-state (for example props, data, setup); path uses property names or array indexes as strings. found:false means the target or path is missing; a present null/undefined value has a codec tag. Objects preview 30 entries. Use edit-component-state only when an intentional change is needed. Supply page:1 to paginate this value; for strings pageSize defaults to 5000 (maximum 5000; collections maximum 500), and total and pageSize count UTF-16 code units and value contains a text segment.' +
        pagingGuide,
      componentField.extend({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(5000).optional(),
        snapshotId: pagination.snapshotId,
      }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'components:stateValue', appId, payload }),
      resultSchemas.stateValue,
    ),
    'inspector-value': tool(
      'Read one field through an existing plugin Inspector, including Pinia. Use inspector/node/section IDs from list-inspectors, inspector-tree and inspector-state. path starts with the state entry key, followed by nested keys. found:false means no matching target or path. Reads still run the plugin getInspectorState hook, but only encode the requested value. Supply page:1 to paginate the value, including long strings (UTF-16 code units; default and maximum pageSize 5000, collections maximum 500).' +
        pagingGuide,
      inspectorField.extend({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(5000).optional(),
        snapshotId: pagination.snapshotId,
      }),
      ({ appId, ...payload }) =>
        connection.query({ type: 'inspectors:stateValue', appId, payload }),
      resultSchemas.stateValue,
    ),
    ...(connection.command
      ? {
          'edit-component-state': tool(
            'Change one existing editable component field through the Kit edit command. First read component-value and check editable. Accepts JSON values only; no delete or rename. Props can be overwritten by the parent. Returns the actual value read after the command; status:1 is command acknowledgement, not proof that the requested value persisted. If transport/readback fails, read state before retrying; do not blindly repeat a mutation.',
            componentField.extend({ value: z.json() }),
            ({ appId, value, ...payload }) =>
              editField(
                { type: 'components:editState', appId, payload: { ...payload, value } },
                () => connection.query({ type: 'components:stateValue', appId, payload }),
              ),
            resultSchemas.edited,
            'action',
          ),
          'edit-inspector-state': tool(
            'Change one existing editable Inspector field through its plugin edit hook, including Pinia. First read inspector-value and check editable. Accepts a JSON value at the entry path; does not replace the entire store. Returns the actual value read after the command, which a plugin may transform or leave unchanged. If transport/readback fails, inspect state before retrying.',
            inspectorField.extend({ value: z.json() }),
            ({ appId, value, ...payload }) =>
              editField(
                { type: 'inspectors:editState', appId, payload: { ...payload, value } },
                () => connection.query({ type: 'inspectors:stateValue', appId, payload }),
              ),
            resultSchemas.edited,
            'action',
          ),
        }
      : {}),
    'expand-value': tool(
      'Expand an encoded value handle from a previous state or inspector query in this app and document. Read only the necessary path. Handles can expire when the same component or inspector node is read again, including by the DevTools panel, or when retained snapshots are released. If a handle is unavailable, rerun the original component-state or inspector-state query and retry with its new handle. After reload, rediscover the page tools first.' +
        pagingGuide,
      target.extend({
        handle: z.string().min(1),
        path: z.array(z.string()).max(20).optional(),
        ...pagination,
        pageSize: z.number().int().min(1).max(5000).optional(),
      }),
      async ({ appId, ...payload }) => {
        const result = await connection.query({ type: 'values:expand', appId, payload })
        if (result == null) {
          throw new Error(
            'Value handle is expired or unknown. Rerun the original component-state or inspector-state query, then retry expand-value with the new handle. If the page reloaded, rediscover its tools first.',
          )
        }
        if ('found' in result && result.found === false) {
          throw new Error(
            'Value path was not found. Read the current value and correct the path before expanding again.',
          )
        }
        return result
      },
      resultSchemas.expanded,
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

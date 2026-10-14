import { z } from 'zod'

const jsonRecord = z.record(z.string(), z.json())
// Preserve codec tags: a present undefined/null value is not a missing field.
const encodedValue: z.ZodType = z.lazy(() =>
  z.union([
    z.object({ kind: z.enum(['null', 'undefined']) }),
    z.object({ kind: z.literal('boolean'), value: z.boolean() }),
    z.object({
      kind: z.literal('number'),
      value: z.union([z.number(), z.enum(['NaN', 'Infinity', '-Infinity'])]),
    }),
    z.object({
      kind: z.literal('string'),
      value: z.string(),
      truncated: z.boolean().optional(),
      length: z.number().optional(),
    }),
    z.object({ kind: z.enum(['bigint', 'date', 'regexp']), value: z.string() }),
    z.object({ kind: z.literal('symbol'), description: z.string() }),
    z.object({
      kind: z.literal('function'),
      name: z.string().optional(),
      sourcePreview: z.string().optional(),
    }),
    z.object({
      kind: z.literal('array'),
      length: z.number(),
      preview: z.array(valueEntry),
      handle: z.string().optional(),
    }),
    z.object({
      kind: z.literal('object'),
      name: z.string(),
      entries: z.number(),
      preview: z.array(valueEntry),
      handle: z.string().optional(),
    }),
    z.object({
      kind: z.enum(['map', 'set']),
      size: z.number(),
      preview: z.array(valueEntry),
      handle: z.string().optional(),
    }),
    z.object({ kind: z.literal('component'), id: z.string().optional(), name: z.string() }),
    z.object({
      kind: z.literal('dom'),
      tag: z.string(),
      id: z.string().optional(),
      className: z.string().optional(),
    }),
    z.looseObject({
      kind: z.literal('custom'),
      value: encodedValue,
      handle: z.string().optional(),
      readOnly: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal('error'),
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    }),
    z.object({ kind: z.literal('circular'), handle: z.string() }),
  ]),
)
const valueEntry = z.object({ key: z.string(), value: encodedValue })
const treeNode = z.looseObject({
  id: z.string(),
  appId: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  file: z.string().optional(),
  childCount: z.number().optional(),
  updatedAt: z.number(),
})
const inspectorNode: z.ZodType = z.lazy(() =>
  z.looseObject({ id: z.string(), label: z.string(), children: z.array(inspectorNode).optional() }),
)
const route: z.ZodType = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string().optional(),
    meta: jsonRecord.optional(),
    children: z.array(route).optional(),
  }),
)
const pagination = z.object({
  total: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  current: z.number().int().positive(),
  next: z.number().int().positive().nullable(),
})
const state = z.object({
  snapshotId: z.string(),
  pagination,
  componentId: z.string(),
  version: z.number(),
  sections: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      partial: z.boolean().optional(),
      entries: z.array(
        valueEntry.extend({
          path: z.array(z.string()),
          editable: z.boolean(),
          meta: jsonRecord.optional(),
        }),
      ),
    }),
  ),
  reactivityGraph: z
    .object({
      nodes: z.array(
        z.object({ id: z.string(), type: z.string(), label: z.string(), data: jsonRecord }),
      ),
      relationships: z.array(z.object({ id: z.string(), from: z.string(), to: z.string() })),
    })
    .optional(),
})
const stateValueSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    editable: z.boolean(),
    value: encodedValue,
    snapshotId: z.string().optional(),
    pagination: pagination.optional(),
  }),
])
export const resultSchemas = {
  apps: z.object({
    apps: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        version: z.string().optional(),
        componentCount: z.number(),
      }),
    ),
  }),
  plugins: z.object({
    plugins: z.array(
      z.looseObject({ id: z.string(), settings: jsonRecord, settingValues: jsonRecord }),
    ),
  }),
  health: z.object({
    status: z.literal('ready'),
    performance: z.object({
      receivedEvents: z.number(),
      emittedEvents: z.number(),
      droppedEvents: z.number(),
      coalescedEvents: z.number(),
      bufferedEvents: z.number(),
      bufferedBytes: z.number(),
      collectionActive: z.boolean(),
      attachedClients: z.number(),
    }),
  }),
  tree: z.object({
    appId: z.string().optional(),
    version: z.number().optional(),
    nodes: z.array(treeNode),
  }),
  children: z.object({ nodes: z.array(treeNode), cursor: z.string().optional() }),
  command: z.object({ status: z.union([z.literal(0), z.literal(1)]), error: z.json().optional() }),
  state: state.nullable(),
  inspectors: z.object({
    inspectors: z.array(z.looseObject({ id: z.string(), label: z.string() })),
  }),
  inspectorTree: z.object({ inspectorId: z.string(), rootNodes: z.array(inspectorNode) }),
  renderCode: z.string().nullable(),
  router: z.object({
    appId: z.string().optional(),
    currentRoute: z
      .looseObject({
        path: z.string().optional(),
        fullPath: z.string().optional(),
        matched: z.array(route).optional(),
      })
      .optional(),
    routes: z.array(route),
  }),
  matches: z.object({ appId: z.string().optional(), path: z.string(), routes: z.array(route) }),
  expanded: z.object({
    handle: z.string(),
    path: z.array(z.string()),
    value: encodedValue,
    snapshotId: z.string(),
    pagination,
  }),
  stateValue: stateValueSchema,
  edited: z.object({ status: z.literal(1), state: stateValueSchema }),
}

export function snapshotSchema(result: z.ZodType) {
  return z.object({
    page: z.object({ id: z.string(), url: z.string(), title: z.string() }),
    capturedAt: z.number(),
    result,
  })
}

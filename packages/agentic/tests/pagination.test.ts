// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createDevtoolsKit } from '../../kit/src/kit'
import type { DevtoolsKit } from '../../kit/src/kit'
import type { ComponentStateSnapshotMessage, ExpandedValueMessage } from '../../kit/src/protocol'
import { measureRuntimeMessageBytes } from '../../kit/src/rpc/event-buffer'
import { createComponentTreeFixture } from '../../../tests/fixtures/runtime'
import { createVueDevtoolsAgentTools } from '../src'

let kit: DevtoolsKit
afterEach(async () => {
  await kit?.dispose()
  vi.restoreAllMocks()
})
async function setup(props: Record<string, unknown>) {
  kit = createDevtoolsKit({ target: { name: 'pagination' }, hook: { install: false } })
  kit.install()
  const fixture = createComponentTreeFixture(1)
  Object.assign(fixture.instances[0]!, { props })
  kit.runtime.dispatch({
    type: 'app:init',
    app: fixture.app,
    time: 1,
    version: '3.5.0',
    vueTypes: {},
  })
  const tree = await kit.runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
  return {
    fixture,
    componentId: tree.nodes[0]!.id,
    tools: createVueDevtoolsAgentTools(kit.runtime, { id: 'p', url: '/', title: '' }),
  }
}

it('walks every field across byte-limited pages without gaps, including plugin fields in an existing section', async () => {
  const props = Object.fromEntries(
    Array.from({ length: 501 }, (_, i) => [`field${i}`, '€'.repeat(10_000)]),
  )
  const readFirst = vi.fn(() => '€'.repeat(10_000))
  Object.defineProperty(props, 'field0', { enumerable: true, get: readFirst })
  const { tools, componentId, fixture } = await setup(props)
  await kit.plugins.register({ id: 'extra', app: fixture.app }, (api) => {
    api.on.inspectComponent((payload) => {
      ;(payload.instanceData as { state: unknown[] }).state.push({
        type: 'props',
        key: 'extra',
        value: 1,
      })
    })
  })
  const target = { appId: 'app:0', componentId, pageSize: 500 }
  const read = async (page: number, snapshotId?: string) =>
    (await tools['component-state'].handler({ ...target, page, snapshotId }))
      .result as ComponentStateSnapshotMessage
  let result = await read(1)
  expect(readFirst).toHaveBeenCalledOnce()
  const keys: string[] = []
  expect(result.pagination!.total).toBeGreaterThanOrEqual(502)
  expect(result.sections[0]!.entries.length).toBeLessThan(500)
  expect(await read(1, result.snapshotId)).toEqual(result)
  for (;;) {
    expect(measureRuntimeMessageBytes(result)).toBeLessThan(2 * 1024 * 1024)
    expect(
      tools['component-state'].returns.safeParse({
        page: { id: 'p', url: '/', title: '' },
        capturedAt: 1,
        result,
      }).success,
    ).toBe(true)
    keys.push(
      ...result.sections
        .filter((section) => section.id === 'props')
        .flatMap((section) => section.entries.map((entry) => entry.key)),
    )
    if (result.pagination!.next === null) break
    result = await read(result.pagination!.next, result.snapshotId)
  }
  expect(keys).toEqual([...Object.keys(props), 'extra'])
})

it.each(['array', 'object', 'map', 'set'] as const)(
  'pages through nested %s values in order',
  async (kind) => {
    const values = Array.from({ length: 121 }, (_, i) => i)
    const payload =
      kind === 'array'
        ? values
        : kind === 'object'
          ? Object.fromEntries(values.map((i) => [`key${i}`, i]))
          : kind === 'map'
            ? new Map(values.map((i) => [`key${i}`, i]))
            : new Set(values)
    const { tools, componentId } = await setup({ payload })
    const state = (await tools['component-state'].handler({ appId: 'app:0', componentId }))
      .result as ComponentStateSnapshotMessage
    const encoded = state.sections[0]!.entries[0]!.value
    if (!('handle' in encoded) || !encoded.handle) throw new Error('Missing handle')
    const target = { appId: 'app:0', handle: encoded.handle, pageSize: 50 }
    let result = (await tools['expand-value'].handler(target)).result as ExpandedValueMessage
    const actual: unknown[] = []
    for (;;) {
      expect(result.pagination!.total).toBe(121)
      if (!('preview' in result.value)) throw new Error('Missing preview')
      actual.push(
        ...result.value.preview.map((entry) =>
          entry.value.kind === 'number' ? entry.value.value : null,
        ),
      )
      if (!result.pagination!.next) break
      result = (
        await tools['expand-value'].handler({
          ...target,
          page: result.pagination!.next,
          snapshotId: result.snapshotId,
        })
      ).result as ExpandedValueMessage
    }
    expect(actual).toEqual(values)
  },
)

it('pages Inspector state through one hook invocation per batch', async () => {
  const { tools, fixture } = await setup({})
  const hook = vi.fn((payload) => {
    payload.state = { store: Array.from({ length: 123 }, (_, i) => ({ key: String(i), value: i })) }
  })
  await kit.plugins.register({ id: 'stores', app: fixture.app }, (api) => {
    api.addInspector({ id: 'stores', label: 'Stores' })
    api.on.getInspectorState(hook)
  })
  const target = { appId: 'app:0', inspectorId: 'stores', nodeId: 'counter', pageSize: 50 }
  let result = (await tools['inspector-state'].handler(target))
    .result as ComponentStateSnapshotMessage
  const keys: string[] = []
  for (;;) {
    keys.push(...result.sections.flatMap((section) => section.entries.map((entry) => entry.key)))
    if (!result.pagination!.next) break
    result = (
      await tools['inspector-state'].handler({
        ...target,
        page: result.pagination!.next,
        snapshotId: result.snapshotId,
      })
    ).result as ComponentStateSnapshotMessage
  }
  expect(keys).toEqual(Array.from({ length: 123 }, (_, i) => String(i)))
  expect(hook).toHaveBeenCalledOnce()
})

it('rejects invalid continuation and expires retained batches with recovery instructions', async () => {
  const { tools, componentId } = await setup(
    Object.fromEntries(Array.from({ length: 110 }, (_, i) => [String(i), i])),
  )
  const target = { appId: 'app:0', componentId, pageSize: 50 }
  const first = (await tools['component-state'].handler(target))
    .result as ComponentStateSnapshotMessage
  await expect(tools['component-state'].handler({ ...target, page: 2 })).rejects.toThrow(
    'snapshotId',
  )
  await expect(
    tools['component-state'].handler({ ...target, page: 3, snapshotId: first.snapshotId }),
  ).rejects.toThrow('in order')
  await expect(
    tools['component-state'].handler({
      ...target,
      page: 2,
      pageSize: 20,
      snapshotId: first.snapshotId,
    }),
  ).rejects.toThrow('parameters changed')
  for (let i = 0; i < 8; i++) await tools['component-state'].handler(target)
  await expect(
    tools['component-state'].handler({ ...target, page: 2, snapshotId: first.snapshotId }),
  ).rejects.toThrow('Restart at page 1')
})

it('reconstructs long strings by field path and keeps ordinary reads as previews', async () => {
  const text = 'Vue € 🌍'.repeat(2000)
  const { tools, componentId } = await setup({ text })
  const target = { appId: 'app:0', componentId, sectionId: 'props', path: ['text'] }
  const preview = (await tools['component-value'].handler(target)).result as {
    found: boolean
    value: { truncated?: boolean }
    pagination?: unknown
  }
  expect(preview.value.truncated).toBe(true)
  expect(preview.pagination).toBeUndefined()
  let result = (await tools['component-value'].handler({ ...target, page: 1, pageSize: 499 }))
    .result as Extract<import('../../kit/src/protocol').StateValueMessage, { found: true }>
  let actual = ''
  for (;;) {
    expect(result.pagination!.total).toBe(text.length)
    if (result.value.kind !== 'string') throw new Error('Expected string segment')
    actual += result.value.value
    if (!result.pagination!.next) break
    result = (
      await tools['component-value'].handler({
        ...target,
        page: result.pagination!.next,
        pageSize: 499,
        snapshotId: result.snapshotId,
      })
    ).result as typeof result
  }
  expect(actual).toBe(text)
})

it('retains the original object keys when the live collection changes between pages', async () => {
  const payload: Record<string, number> = { a: 1, b: 2, c: 3 }
  const { tools, componentId } = await setup({ payload })
  const target = { appId: 'app:0', componentId, sectionId: 'props', path: ['payload'], pageSize: 1 }
  const first = (await tools['component-value'].handler({ ...target, page: 1 })).result as Extract<
    import('../../kit/src/protocol').StateValueMessage,
    { found: true }
  >
  delete payload.a
  payload.d = 4
  const second = (
    await tools['component-value'].handler({ ...target, page: 2, snapshotId: first.snapshotId })
  ).result as typeof first
  const third = (
    await tools['component-value'].handler({ ...target, page: 3, snapshotId: first.snapshotId })
  ).result as typeof first
  expect(second.value).toMatchObject({ preview: [{ key: 'b', value: { value: 2 } }] })
  expect(third.value).toMatchObject({ preview: [{ key: 'c', value: { value: 3 } }] })
  expect(third.pagination).toEqual({ total: 3, current: 3, pageSize: 1, next: null })
})

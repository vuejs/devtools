// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, readonly, ref, shallowReadonly } from 'vue'
import { z } from 'zod'
import { createDevtoolsKit } from '../../kit/src/kit'
import type { DevtoolsKit } from '../../kit/src/kit'
import { createComponentTreeFixture } from '../../../tests/fixtures/runtime'
import { createVueDevtoolsAgentTools } from '../src'

let kit: DevtoolsKit
const page = { id: 'test', url: '/', title: 'Fields' }
afterEach(async () => {
  vi.restoreAllMocks()
  await kit?.dispose()
})

async function setup() {
  kit = createDevtoolsKit({ target: { name: 'fields' }, hook: { install: false } })
  kit.install()
  const fixture = createComponentTreeFixture(1)
  const props = Object.fromEntries(Array.from({ length: 601 }, (_, i) => [`field${i}`, i]))
  Object.assign(props, { nil: null, absent: undefined })
  const unread = vi.fn(() => {
    throw new Error('Do not read unrelated values')
  })
  Object.defineProperty(props, 'unrelated', { enumerable: true, get: unread })
  Object.assign(fixture.instances[0]!, {
    props,
    setupState: {
      count: ref(1),
      locked: computed(() => 7),
      nested: { locked: readonly({ count: 3 }) },
    },
  })
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
    unread,
    componentId: tree.nodes[0]!.id,
    tools: createVueDevtoolsAgentTools(kit.runtime, page),
  }
}

it('reads a field beyond 500, distinguishes missing/null/undefined and isolates app IDs', async () => {
  const { tools, componentId, unread } = await setup()
  const input = { appId: 'app:0', componentId, sectionId: 'props', path: ['field600'] }
  const result = await tools['component-value'].handler(input)
  expect(result.result).toEqual({
    found: true,
    editable: true,
    value: { kind: 'number', value: 600 },
  })
  expect(tools['component-value'].returns.safeParse(result).success).toBe(true)
  expect(unread).not.toHaveBeenCalled()
  for (const [key, kind] of [
    ['nil', 'null'],
    ['absent', 'undefined'],
  ]) {
    expect(
      (await tools['component-value'].handler({ ...input, path: [key!] })).result,
    ).toMatchObject({ found: true, value: { kind } })
  }
  expect((await tools['component-value'].handler({ ...input, path: ['missing'] })).result).toEqual({
    found: false,
  })
  expect((await tools['component-value'].handler({ ...input, appId: 'wrong' })).result).toEqual({
    found: false,
  })
})

it('uses the existing component edit command, reads back refs and rejects readonly or unsafe fields', async () => {
  const { tools, componentId } = await setup()
  const input = { appId: 'app:0', componentId, sectionId: 'setup', path: ['count'], value: 9 }
  const command = vi.spyOn(kit.runtime, 'command')
  const result = await tools['edit-component-state']!.handler(input)
  expect(command).toHaveBeenCalledWith({
    type: 'components:editState',
    appId: 'app:0',
    payload: { componentId, sectionId: 'setup', path: ['count'], value: 9 },
  })
  expect(result.result).toMatchObject({
    status: 1,
    state: { found: true, value: { kind: 'number', value: 9 } },
  })
  expect(tools['edit-component-state']!.returns.safeParse(result).success).toBe(true)
  command.mockClear()
  await expect(
    tools['edit-component-state']!.handler({ ...input, path: ['locked'] }),
  ).rejects.toThrow('read-only')
  await expect(
    tools['edit-component-state']!.handler({ ...input, path: ['nested', 'locked', 'count'] }),
  ).rejects.toThrow('read-only')
  await expect(
    tools['edit-component-state']!.handler({ ...input, path: ['missing'] }),
  ).rejects.toThrow('not found')
  await expect(
    tools['edit-component-state']!.handler({ ...input, path: ['__proto__', 'polluted'] }),
  ).rejects.toThrow()
  expect(command).not.toHaveBeenCalled()
})

it('treats nested props on a shallowReadonly props proxy as editable', async () => {
  const { tools, fixture, componentId } = await setup()
  const nested = { item: 1 }
  const locked = readonly({ count: 3 })
  Object.assign(fixture.instances[0]!, { props: shallowReadonly({ nested, locked }) })
  const input = { appId: 'app:0', componentId, sectionId: 'props', path: ['nested', 'item'] }
  expect((await tools['component-value'].handler(input)).result).toMatchObject({
    found: true,
    editable: true,
    value: { kind: 'number', value: 1 },
  })
  const edited = await tools['edit-component-state']!.handler({ ...input, value: 4 })
  expect(edited.result).toMatchObject({
    status: 1,
    state: { found: true, editable: true, value: { kind: 'number', value: 4 } },
  })
  expect(nested.item).toBe(4)
  await expect(
    tools['edit-component-state']!.handler({
      ...input,
      path: ['locked', 'count'],
      value: 9,
    }),
  ).rejects.toThrow('read-only')
  expect(locked.count).toBe(3)
})

it('reads and edits Inspector state via plugin hooks, returning the actual plugin result', async () => {
  const { tools, fixture } = await setup()
  const values = { count: 1, locked: 3 }
  await kit.plugins.register({ id: 'fields', app: fixture.app }, (api) => {
    api.addInspector({ id: 'fields', label: 'Fields' })
    api.on.getInspectorState((payload) => {
      if (payload.inspectorId !== 'fields' || payload.nodeId !== 'node') return
      payload.state = {
        custom: [
          { key: 'value', value: values, editable: true },
          { key: 'readonly', value: 1, editable: false },
        ],
      }
    })
    api.on.editInspectorState((payload) => {
      if (payload.inspectorId !== 'fields') return
      // Simulate plugin-side normalization rather than echoing the requested value.
      payload.set!({ value: values }, payload.path, Math.min(Number(payload.state.value), 10))
    })
  })
  const input = {
    appId: 'app:0',
    inspectorId: 'fields',
    nodeId: 'node',
    sectionId: 'custom',
    path: ['value', 'count'],
  }
  expect((await tools['inspector-value'].handler(input)).result).toMatchObject({
    found: true,
    value: { value: 1 },
  })
  const edited = await tools['edit-inspector-state']!.handler({ ...input, value: 99 })
  expect(edited.result).toMatchObject({ status: 1, state: { value: { value: 10 } } })
  expect(values.count).toBe(10)
  expect(tools['edit-inspector-state']!.returns.safeParse(edited).success).toBe(true)
  await expect(
    tools['edit-inspector-state']!.handler({ ...input, path: ['readonly'], value: 5 }),
  ).rejects.toThrow('read-only')
  expect((await tools['inspector-value'].handler({ ...input, appId: 'wrong' })).result).toEqual({
    found: false,
  })
})

it('exports JSON output schemas and only advertises mutations on command-capable hosts', async () => {
  const { tools, componentId } = await setup()
  for (const tool of Object.values(tools)) {
    expect(z.toJSONSchema(tool.returns).type).toBe('object')
  }
  expect(tools['edit-component-state']!.agent.safety).toBe('action')
  expect(tools['edit-inspector-state']!.type).toBe('action')
  const reads = createVueDevtoolsAgentTools({ query: kit.runtime.query.bind(kit.runtime) }, page)
  expect(reads['edit-component-state']).toBeUndefined()
  expect(reads['edit-inspector-state']).toBeUndefined()
  const failure = vi
    .spyOn(kit.runtime, 'command')
    .mockResolvedValue({ status: 0, error: 'Rejected by plugin' })
  await expect(
    tools['edit-component-state']!.handler({
      appId: 'app:0',
      componentId,
      sectionId: 'setup',
      path: ['count'],
      value: 4,
    }),
  ).rejects.toThrow('Rejected by plugin')
  expect(failure).toHaveBeenCalledOnce()
})

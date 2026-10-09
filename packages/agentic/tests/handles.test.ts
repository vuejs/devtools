// @vitest-environment happy-dom
import type {
  ComponentTreeSnapshotMessage,
  ComponentStateSnapshotMessage,
} from '../../kit/src/protocol'
import { it, expect } from 'vitest'
import { createDevtoolsRuntime } from '../../kit/src/runtime/runtime'
import { createComponentTreeFixture } from '../../../tests/fixtures/runtime'
import { createVueDevtoolsAgentTools } from '../src'

it('reports expired handles after another reader takes a snapshot and recovers with a fresh handle', async () => {
  const fixture = createComponentTreeFixture(1)
  Object.assign(fixture.instances[0], {
    props: { payload: { nested: { value: 42 }, absent: undefined } },
  })
  const runtime = createDevtoolsRuntime()
  try {
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const tools = createVueDevtoolsAgentTools(runtime, { id: 'p', url: '/', title: '' })
    const tree = (await tools['component-tree'].handler({ appId: 'app:0' }))
      .result as ComponentTreeSnapshotMessage
    const componentId = tree.nodes[0]!.id
    const first = (await tools['component-state'].handler({ appId: 'app:0', componentId }))
      .result as ComponentStateSnapshotMessage
    const value = first.sections[0]!.entries[0]!.value
    if (!('handle' in value) || !value.handle) throw new Error('Expected an object handle')
    const handle = value.handle
    expect((await tools['expand-value'].handler({ appId: 'app:0', handle })).result).not.toBeNull()
    expect(
      (await tools['expand-value'].handler({ appId: 'app:0', handle, path: ['absent'] })).result,
    ).toMatchObject({ value: { kind: 'undefined' } })
    await expect(
      tools['expand-value'].handler({ appId: 'app:0', handle, path: ['missing'] }),
    ).rejects.toThrow('Value path was not found')
    await runtime.query({
      type: 'components:stateSnapshot',
      appId: 'app:0',
      payload: { componentId },
    })
    await expect(tools['expand-value'].handler({ appId: 'app:0', handle })).rejects.toThrow(
      'Rerun the original component-state or inspector-state query',
    )
    const fresh = (await tools['component-state'].handler({ appId: 'app:0', componentId }))
      .result as ComponentStateSnapshotMessage
    const freshValue = fresh.sections[0]!.entries[0]!.value
    if (!('handle' in freshValue) || !freshValue.handle)
      throw new Error('Expected a fresh object handle')
    const freshHandle = freshValue.handle
    expect(
      (await tools['expand-value'].handler({ appId: 'app:0', handle: freshHandle })).result,
    ).not.toBeNull()
  } finally {
    runtime.dispose()
  }
})

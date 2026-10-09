import type { ComponentStateSnapshotMessage } from '../../kit/src/protocol'
import { expect, it, vi } from 'vitest'
import { createDevtoolsRuntime } from '../../kit/src/runtime/runtime'
import { measureRuntimeMessageBytes } from '../../kit/src/rpc/event-buffer'
import { createComponentTreeFixture } from '../../../tests/fixtures/runtime'
import { createVueDevtoolsAgentTools } from '../src'

it.each(['array', 'object'] as const)(
  'reads 500 fields with 30-entry %s previews and expands omitted entries',
  async (kind) => {
    const fixture = createComponentTreeFixture(1)
    const value = Array.from({ length: 500 }, (_, i) => i)
    Object.assign(fixture.instances[0]!, {
      props: Object.fromEntries(
        Array.from({ length: 501 }, (_, i) => [
          `field${i}`,
          kind === 'array' ? [...value] : Object.fromEntries(value.map((i) => [String(i), i])),
        ]),
      ),
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
      const tree = await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
      const componentId = tree.nodes[0]!.id
      const tools = createVueDevtoolsAgentTools(runtime, { id: 'limits', url: '/', title: '' })
      const defaults = (await tools['component-state'].handler({ appId: 'app:0', componentId }))
        .result as ComponentStateSnapshotMessage
      expect(defaults.sections[0]!.entries).toHaveLength(50)
      const result = (
        await tools['component-state'].handler({ appId: 'app:0', componentId, pageSize: 500 })
      ).result as ComponentStateSnapshotMessage
      const section = result.sections[0]!
      expect(section.entries).toHaveLength(500)
      expect(section.entries[499]!.key).toBe('field499')
      expect(section.partial).toBe(true)
      for (const entry of section.entries) {
        if (!('preview' in entry.value)) throw new Error('Expected a preview')
        expect(entry.value.preview).toHaveLength(30)
      }
      const encoded = section.entries[0]!.value
      if (!('handle' in encoded) || !encoded.handle) throw new Error('Expected a handle')
      const expanded = await tools['expand-value'].handler({
        appId: 'app:0',
        handle: encoded.handle,
        path: ['499'],
      })
      expect(expanded.result).toMatchObject({ value: { kind: 'number', value: 499 } })
      expect(runtime.budget.transport.maxMessageBytes).toBe(2 * 1024 * 1024)
      expect(measureRuntimeMessageBytes(result)).toBeLessThan(
        runtime.budget.transport.maxMessageBytes,
      )

      // Existing UI callers that omit the preview option retain their current behavior.
      const legacy = await runtime.query({
        type: 'components:stateSnapshot',
        appId: 'app:0',
        payload: { componentId, maxEntries: 50 },
      })
      const legacyValue = legacy!.sections[0]!.entries[0]!.value
      if (!('preview' in legacyValue)) throw new Error('Expected a preview')
      expect(legacyValue.preview).toHaveLength(50)
    } finally {
      runtime.dispose()
    }
  },
)

it('applies agent limits to plugin-added component state', async () => {
  const fixture = createComponentTreeFixture(1)
  const runtime = createDevtoolsRuntime()
  const hook = vi.spyOn(runtime, 'callPluginHook').mockImplementation(async (name, payload) => {
    if (name !== 'inspectComponent') return
    const data = payload as { instanceData: { state: unknown[] } }
    for (let i = 0; i < 501; i++)
      data.instanceData.state.push({
        type: 'plugin',
        key: String(i),
        value: Array.from({ length: 100 }, (_, n) => n),
      })
  })
  try {
    runtime.dispatch({
      type: 'app:init',
      app: fixture.app,
      version: '3.5.0',
      vueTypes: {},
      time: 1,
    })
    const tree = await runtime.query({ type: 'components:treeSnapshot', appId: 'app:0' })
    const tools = createVueDevtoolsAgentTools(runtime, { id: 'plugin', url: '/', title: '' })
    const state = (
      await tools['component-state'].handler({
        appId: 'app:0',
        componentId: tree.nodes[0]!.id,
        pageSize: 500,
      })
    ).result as ComponentStateSnapshotMessage
    const section = state.sections.find((section) => section.id === 'plugin')!
    expect(section.entries).toHaveLength(500)
    expect(section.partial).toBe(true)
    for (const entry of section.entries) {
      if (!('preview' in entry.value)) throw new Error('Expected a preview')
      expect(entry.value.preview).toHaveLength(30)
    }
  } finally {
    hook.mockRestore()
    runtime.dispose()
  }
})

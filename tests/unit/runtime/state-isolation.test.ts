// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import type { ComponentStateSnapshotMessage } from '../../../packages/kit/src/protocol'
import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { createComponentTreeFixture } from '../../fixtures'

describe('component state isolation (P0.4)', () => {
  let runtime: DevtoolsRuntime | undefined

  afterEach(() => {
    runtime?.dispose()
    runtime = undefined
  })

  it('recycles state handles across 1,000 component switches', async () => {
    const { runtime: activeRuntime, nodes } = await setupRuntime(1_000)
    runtime = activeRuntime

    for (const node of nodes) {
      await runtime.query({
        appId: 'app:0',
        payload: { componentId: node.id },
        type: 'components:stateSnapshot',
      })
    }

    // Only the retained scope window may keep handles alive; switching 1,000
    // times must not accumulate one registry entry per visited component.
    expect(runtime.componentState.handleCount).toBeLessThan(50)
  })

  it('releases stale handles when the same component is re-snapshotted', async () => {
    const { runtime: activeRuntime, nodes } = await setupRuntime(2)
    runtime = activeRuntime
    const componentId = nodes[0]!.id

    const first = await queryState(runtime, componentId)
    const firstHandle = findFirstHandle(first)
    expect(firstHandle).toBeDefined()

    const second = await queryState(runtime, componentId)
    const secondHandle = findFirstHandle(second)
    expect(secondHandle).toBeDefined()

    expect(runtime.componentState.getHandleValue(secondHandle!)).toBeDefined()
    expect(runtime.componentState.getHandleValue(firstHandle!)).toBeUndefined()
  })

  it('keeps state values isolated between components', async () => {
    const { runtime: activeRuntime, nodes, instances } = await setupRuntime(3)
    runtime = activeRuntime

    const firstState = await queryState(runtime, nodes[1]!.id)
    const secondState = await queryState(runtime, nodes[2]!.id)

    expect(readPayloadIndex(firstState)).toBe((instances[1] as { uid: number }).uid)
    expect(readPayloadIndex(secondState)).toBe((instances[2] as { uid: number }).uid)
  })

  it('expands values through live handles after many switches', async () => {
    const { runtime: activeRuntime, nodes } = await setupRuntime(20)
    runtime = activeRuntime

    const state = await queryState(runtime, nodes[0]!.id)
    const handle = findFirstHandle(state)!

    // Visiting other components must not invalidate the retained scope window
    // for the recently viewed component.
    for (const node of nodes.slice(1, 4)) await queryState(runtime, node.id)

    const expanded = await runtime.query({
      appId: 'app:0',
      payload: { handle },
      type: 'values:expand',
    })
    expect(expanded?.value.kind).toBe('object')
  })

  it('stores the real value as a stable $tempN global via its handle', async () => {
    const { runtime: activeRuntime, nodes, instances } = await setupRuntime(2)
    runtime = activeRuntime

    const state = await queryState(runtime, nodes[0]!.id)
    const handle = findFirstHandle(state)!

    const result = await runtime.query({
      payload: { handle },
      type: 'values:storeAsGlobal',
    })

    expect(result?.varName).toMatch(/^\$temp\d+$/)
    const globals = window as unknown as Record<string, unknown>
    const payload = (instances[0] as unknown as { props: { payload: object } }).props.payload
    expect(globals[result!.varName]).toBe(payload)
    expect(globals.$temp).toBe(payload)
  })

  it('stores primitive entries as globals through their component path', async () => {
    const { runtime: activeRuntime, nodes } = await setupRuntime(2)
    runtime = activeRuntime

    const result = await runtime.query({
      payload: {
        componentId: nodes[0]!.id,
        path: ['payload', 'index'],
        sectionId: 'props',
      },
      type: 'values:storeAsGlobal',
    })

    expect(result?.varName).toMatch(/^\$temp\d+$/)
    const globals = window as unknown as Record<string, unknown>
    expect(globals[result!.varName]).toBe(0)
  })
})

async function setupRuntime(componentCount: number): Promise<{
  runtime: DevtoolsRuntime
  nodes: Array<{ id: string }>
  instances: object[]
}> {
  const fixture = createComponentTreeFixture(componentCount, { branching: componentCount })
  for (const instance of fixture.instances) {
    ;(instance as unknown as Record<string, unknown>).props = {
      payload: { index: instance.uid, items: [instance.uid] },
    }
  }

  const runtime = createDevtoolsRuntime()
  runtime.dispatch({
    app: fixture.app,
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })

  const snapshot = await runtime.query({
    appId: 'app:0',
    type: 'components:treeSnapshot',
  })

  return { instances: fixture.instances, nodes: snapshot.nodes, runtime }
}

async function queryState(
  runtime: DevtoolsRuntime,
  componentId: string,
): Promise<ComponentStateSnapshotMessage> {
  const state = await runtime.query({
    appId: 'app:0',
    payload: { componentId },
    type: 'components:stateSnapshot',
  })
  if (!state) throw new Error(`Missing state snapshot for ${componentId}`)
  return state
}

function findFirstHandle(state: ComponentStateSnapshotMessage): string | undefined {
  for (const section of state.sections) {
    for (const entry of section.entries) {
      if ('handle' in entry.value && entry.value.handle) return entry.value.handle
    }
  }
  return undefined
}

function readPayloadIndex(state: ComponentStateSnapshotMessage): unknown {
  const props = state.sections.find((section) => section.id === 'props')
  const payload = props?.entries.find((entry) => entry.key === 'payload')?.value
  if (!payload || payload.kind !== 'object') return undefined
  const index = payload.preview.find((entry) => entry.key === 'index')?.value
  return index?.kind === 'number' ? index.value : undefined
}

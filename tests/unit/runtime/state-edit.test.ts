import { describe, expect, it } from 'vitest'
import { effect, reactive, ref } from 'vue'
import {
  addStateValue,
  deleteStateValue,
  resolvePath,
  setStateValue,
} from '../../../packages/kit/src/runtime/state/edit'
import { createLegacyStateSetter } from '../../../packages/kit/src/runtime/state/legacy-edit'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

describe('collection state editing', () => {
  it.each([[9], [], [9, 8, 7, 6]])(
    'replaces reactive array contents and length with %j',
    (...items) => {
      const next = items as number[]
      const array = reactive([1, 2, 3])
      const state = { array }
      let length = 0
      effect(() => {
        length = array.length
      })
      expect(setStateValue(state, ['array'], next)).toBe(true)
      expect(state.array).toBe(array)
      expect([...array]).toEqual(next)
      expect(length).toBe(next.length)
    },
  )

  it.each([
    { initial: { a: 1 }, next: [8, 9] },
    { initial: [1, 2], next: { a: 9 } },
  ])('replaces container type rather than patching across types', ({ initial, next }) => {
    const state = reactive({ value: initial })
    let array = Array.isArray(state.value)
    effect(() => {
      array = Array.isArray(state.value)
    })
    expect(setStateValue(state, ['value'], next)).toBe(true)
    expect(state.value).toEqual(next)
    expect(array).toBe(Array.isArray(next))
  })

  it.each([1, true, 1n, Symbol('key'), { id: 1 }, null, undefined])(
    'preserves the identity of key %s',
    (key) => {
      const map = new Map([[key, 1]])
      const label =
        typeof key === 'symbol'
          ? 'key'
          : key != null && typeof key === 'object'
            ? 'Object'
            : String(key)
      expect(setStateValue({ map }, ['map', label], 2)).toBe(true)
      expect([...map]).toEqual([[key, 2]])
      expect(resolvePath({ map }, ['map', label])).toEqual({ found: true, value: 2 })
      expect(deleteStateValue({ map }, ['map', label])).toBe(true)
      expect(map.size).toBe(0)
    },
  )

  it('rejects ambiguous labels without changing either entry', () => {
    const map = new Map<unknown, unknown>([
      [1, 'number'],
      ['1', 'string'],
    ])
    expect(setStateValue({ map }, ['map', '1'], 2)).toBe(false)
    expect(deleteStateValue({ map }, ['map', '1'])).toBe(false)
    expect(resolvePath({ map }, ['map', '1']).found).toBe(false)
    expect([...map]).toEqual([
      [1, 'number'],
      ['1', 'string'],
    ])
  })

  it.each(['native', 'legacy'])('notifies effects through %s collection edits', (mode) => {
    const map = reactive(new Map([['x', 1]]))
    const set = reactive(new Set([1]))
    let seenMap = 0
    let seenSet = 0
    effect(() => {
      seenMap = map.get('x')!
    })
    effect(() => {
      seenSet = [...set].reduce((a, b) => a + b, 0)
    })
    if (mode === 'native') setStateValue({ map }, ['map', 'x'], 2)
    else createLegacyStateSetter({ value: 2 })({ map }, ['map', 'x'])
    expect(seenMap).toBe(2)
    if (mode === 'native') setStateValue({ set }, ['set', '0'], 3)
    else createLegacyStateSetter({ value: 3 })({ set }, ['set', '0'])
    expect(seenSet).toBe(3)
    if (mode === 'native') deleteStateValue({ set }, ['set', '0'])
    else createLegacyStateSetter({ remove: true })({ set }, ['set', '0'])
    expect(seenSet).toBe(0)
    addStateValue({ set }, ['set'], 4)
    expect(seenSet).toBe(4)
  })

  it('resolves nested refs and collections and distinguishes undefined from missing', () => {
    const root = { map: ref(new Map([['x', new Set([{ value: undefined }])]])) }
    expect(resolvePath(root, ['map', 'x', '0', 'value'])).toEqual({ found: true, value: undefined })
    expect(resolvePath(root, ['map', 'missing'])).toEqual({ found: false })
    expect(resolvePath(root, ['map', 'x', '2'])).toEqual({ found: false })
  })

  it('reports failed RPC edits and resolves collection values for global storage', async () => {
    const runtime = createDevtoolsRuntime()
    try {
      const instance = {
        uid: 0,
        type: { name: 'Probe' },
        setupState: { map: new Map([['x', 2]]) },
        subTree: {},
      }
      runtime.dispatch({
        type: 'app:init',
        app: { _instance: instance },
        version: '3.5.0',
        vueTypes: {},
        time: 1,
      })
      const componentId = runtime.registry.getComponentId(instance)!
      const result = await runtime.command({
        type: 'components:editState',
        appId: 'app:0',
        payload: { componentId, sectionId: 'setup', path: ['missing', 'x'], value: 2 },
      })
      expect(result.status).toBe(0)
      expect(runtime.componentState.resolveEntryValue(componentId, 'setup', ['map', 'x'])).toEqual({
        found: true,
        value: 2,
      })
      expect(
        runtime.componentState.resolveEntryValue(componentId, 'setup', ['map', 'missing']),
      ).toEqual({ found: false })
    } finally {
      runtime.dispose()
    }
  })
})

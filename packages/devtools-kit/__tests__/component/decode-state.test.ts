import { getObjectDetails } from '../../src/core/component/state/custom'

function omitKeysOnCustom(obj: { _custom: { [key: string]: unknown } } | undefined, keys: string[]) {
  return obj == null ? obj : { _custom: Object.fromEntries(Object.entries(obj._custom).filter(([key]) => !keys.includes(key))) }
}

it.each([
  [
    'computed',
    () => {
      const a = computed(() => 'foo')
      a.value
      return a
    },
    {
      _custom: {
        stateTypeName: 'Computed',
        type: 'computed',
        value: 'foo',
      },
    },
  ],
  [
    'ref',
    () => {
      const a = ref('foo')
      return a
    },
    {
      _custom: {
        stateTypeName: 'Ref',
        type: 'ref',
        value: 'foo',
      },
    },
  ],
  [
    'reactive',
    () => {
      const a = reactive({ foo: 'foo' })
      return a
    },
    {
      _custom: {
        stateTypeName: 'Reactive',
        type: 'reactive',
        value: {
          foo: 'foo',
        },
      },
    },
  ],
  [
    'toRef w/ ref',
    () => {
      const foo = ref('1')
      const a = toRef(foo)
      return a
    },
    {
      _custom: {
        stateTypeName: 'Ref',
        type: 'ref',
        value: '1',
      },
    },
  ],
  [
    'toRef w/ getter',
    () => {
      const bar = computed(() => '1')
      const a = toRef(() => bar.value)
      a.value
      return a
    },
    {
      _custom: {
        stateTypeName: 'Ref',
        type: 'ref',
        value: '1',
      },
    },
  ],
  [
    'toRef w/ object',
    () => {
      const bar = reactive({ value: '1' })
      const a = toRef(bar, 'value')
      a.value
      return a
    },
    {
      _custom: {
        stateTypeName: 'Ref',
        type: 'ref',
        value: '1',
      },
    },
  ],
  [
    'toRefs',
    () => {
      const bar = reactive({ value: '1', value2: '2' })
      const a = toRefs(bar)
      a.value.value
      return a.value
    },
    {
      _custom: {
        stateTypeName: 'Ref',
        type: 'ref',
        value: '1',
      },
    },
  ],
])('should getObjectDetail by passing %s state', (_, state, expected) => {
  expect(omitKeysOnCustom(getObjectDetails(state()), ['tooltipText'])).toEqual(expected)
})

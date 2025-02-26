import { INFINITY, NAN, NEGATIVE_INFINITY, UNDEFINED } from '../../src/core/component/state/constants'
import * as format from '../../src/core/component/state/format'

import { customTypeEnums } from '../../src/core/component/types'

describe('format: displayText and rawValue can be calculated by formatInspectorStateValue, getRaw', () => {
  describe('type: literals', () => {
    // eslint-disable-next-line test/consistent-test-it
    test.each([
      { literal: 'test-string', displayText: 'test-string' },
      { literal: 123, displayText: 123 },
      { literal: true, displayText: true },
      { literal: null, displayText: 'null' },
      // Tokenlized values
      { literal: INFINITY, displayText: 'Infinity' },
      { literal: NAN, displayText: 'NaN' },
      { literal: NEGATIVE_INFINITY, displayText: '-Infinity' },
      { literal: UNDEFINED, displayText: 'undefined' },
    ])('type: %s', (value) => {
      const displayText = format.formatInspectorStateValue(value.literal)
      const rawValue = format.getRaw(value.literal).value

      expect(displayText).toBe(value.displayText)
      expect(rawValue).toBe(value.literal)
    })
  })

  it('type: plain object', () => {
    const value = { foo: 'bar' }
    const displayText = format.formatInspectorStateValue(value)
    const rawValue = format.getRaw(value).value

    expect(displayText).toBe('Object')
    expect(rawValue).toEqual(value)
  })

  it('type: array', () => {
    const value = ['foo', { bar: 'baz' }]
    const displayText = format.formatInspectorStateValue(value)
    const rawValue = format.getRaw(value).value

    expect(displayText).toBe('Array[2]')
    expect(rawValue).toEqual(value)
  })

  describe('type: custom', () => {
    it('type: common custom', () => {
      const value = { _custom: { displayText: 'custom-display', value: Symbol(123) } }
      const displayText = format.formatInspectorStateValue(value)
      const rawValue = format.getRaw(value).value

      expect(displayText).toBe(value._custom.displayText)
      expect(rawValue).toEqual(value._custom.value)
    })

    it('type: nested custom', () => {
      const value = {
        _custom: {
          displayText: 'custom-display',
          value: {
            _custom: { displayText: 'nested-custom-display', value: Symbol(123) },
          },
        },
      }

      const displayText = format.formatInspectorStateValue(value)
      const rawValue = format.getRaw(value).value

      expect(displayText).toBe(value._custom.value._custom.displayText)
      expect(rawValue).toEqual(value._custom.value._custom.value)
    })
  })
})

describe('format: toEdit', () => {
  // eslint-disable-next-line test/consistent-test-it
  test.each([
    { value: 123, target: '123' },
    { value: 'string-value', target: '"string-value"' },
    { value: true, target: 'true' },
    { value: null, target: 'null' },
    // Tokenlized values
    { value: INFINITY, target: 'Infinity' },
    { value: NAN, target: 'NaN' },
    { value: NEGATIVE_INFINITY, target: '-Infinity' },
    { value: UNDEFINED, target: 'undefined' },
    // Object that has tokenlized values
    { value: { foo: INFINITY }, target: '{"foo":Infinity}' },
    { value: { foo: NAN }, target: '{"foo":NaN}' },
    { value: { foo: NEGATIVE_INFINITY }, target: '{"foo":-Infinity}' },
    { value: { foo: UNDEFINED }, target: '{"foo":undefined}' },
    { value: '123', customType: 'bigint' as customTypeEnums, target: '123' },
    { value: '2024-03-12T00:00:55.666', customType: 'date' as customTypeEnums, target: '2024-03-12T00:00:55.666' },
  ])('value: $value will be deserialized to target', (value) => {
    const deserialized = format.toEdit(value.value, value.customType)
    expect(deserialized).toBe(value.target)
  })
})

describe('format: toSubmit', () => {
  // eslint-disable-next-line test/consistent-test-it
  test.each([
    { value: '123', target: 123 },
    { value: '"string-value"', target: 'string-value' },
    { value: 'true', target: true },
    { value: 'null', target: null },
    // Tokenlized values
    { value: 'Infinity', target: Number.POSITIVE_INFINITY },
    { value: 'NaN', target: Number.NaN },
    { value: '-Infinity', target: Number.NEGATIVE_INFINITY },
    { value: 'undefined', target: undefined },
    // // Object that has tokenlized values
    { value: '{"foo":Infinity}', target: { foo: Number.POSITIVE_INFINITY } },
    { value: '{"foo":NaN}', target: { foo: Number.NaN } },
    { value: '{"foo":-Infinity}', target: { foo: Number.NEGATIVE_INFINITY } },
    // when serializing { key: undefined }, the key will be removed.
    { value: '{"foo":undefined}', target: {} },
    // Regex test: The token in key field kept untouched.
    { value: '{"undefined": NaN }', target: { undefined: Number.NaN } },
    { value: '123', customType: 'bigint' as customTypeEnums, target: BigInt(123) },
    { value: '2024-03-12T00:00:55.666', customType: 'date' as customTypeEnums, target: new Date('2024-03-12T00:00:55.666') },
  ])('value: $value will be serialized to target', (value) => {
    const serialized = format.toSubmit(value.value, value.customType)
    expect(serialized).toStrictEqual(value.target)
  })
})

describe('format: customClass', () => {
  it.each([
    { value: 'string-value', target: '<span class="custom-class">string-value</span>' },
  ])('value: $value should be serialized to target with custom class', (value) => {
    const serialized = format.formatInspectorStateValue(value.value, false, {
      customClass: {
        string: 'custom-class',
      },
    })
    expect(serialized).toStrictEqual(value.target)
  })
})

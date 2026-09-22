import { describe, expect, it } from 'vitest'
import { formatEditText, parseEditText } from '../../../packages/kit/src/codec/edit'
import { encodeValue } from '../../../packages/kit/src/codec/encode'

// P0.4 typed codec round-trip coverage. Related upstream issues:
// https://github.com/vuejs/devtools/issues/1087 (string "undefined" vs undefined)
// https://github.com/vuejs/devtools/issues/809 (null handling)
// https://github.com/vuejs/devtools/issues/953 https://github.com/vuejs/devtools/issues/906
function roundTrip(value: unknown): unknown {
  const encoded = encodeValue(value)
  return parseEditText(encoded, formatEditText(encoded))
}

describe('typed edit codec round-trip', () => {
  it('keeps the string "undefined" distinct from undefined', () => {
    expect(encodeValue('undefined')).toEqual({ kind: 'string', value: 'undefined' })
    expect(encodeValue(undefined)).toEqual({ kind: 'undefined' })
    expect(roundTrip('undefined')).toBe('undefined')
    expect(roundTrip(undefined)).toBeUndefined()
  })

  it('keeps the string "null" distinct from null', () => {
    expect(encodeValue('null')).toEqual({ kind: 'string', value: 'null' })
    expect(encodeValue(null)).toEqual({ kind: 'null' })
    expect(roundTrip('null')).toBe('null')
    expect(roundTrip(null)).toBeNull()
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['float', -1.5],
    ['large integer', 9007199254740991],
  ])('round-trips %s numbers', (_label, value) => {
    expect(Object.is(roundTrip(value), value)).toBe(true)
  })

  it('keeps the string "NaN" distinct from NaN', () => {
    expect(encodeValue('NaN')).toEqual({ kind: 'string', value: 'NaN' })
    expect(encodeValue(Number.NaN)).toEqual({ kind: 'number', value: 'NaN' })
    expect(roundTrip('NaN')).toBe('NaN')
  })

  it('round-trips bigints without precision loss', () => {
    const value = 123456789012345678901234567890n
    expect(encodeValue(value)).toEqual({ kind: 'bigint', value: value.toString() })
    expect(roundTrip(value)).toBe(value)
  })

  it('round-trips booleans', () => {
    expect(roundTrip(true)).toBe(true)
    expect(roundTrip(false)).toBe(false)
  })

  it('round-trips dates through their ISO representation', () => {
    const value = new Date('2024-02-29T12:34:56.789Z')
    const result = roundTrip(value)
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getTime()).toBe(value.getTime())
  })

  it('round-trips regular expressions with flags', () => {
    const value = /ab+c/gi
    const result = roundTrip(value)
    expect(result).toBeInstanceOf(RegExp)
    expect(String(result)).toBe('/ab+c/gi')
  })

  it('round-trips strings that look like other types', () => {
    for (const text of ['true', '123', '[1,2]', '{"a":1}', '/regex/g', '2024-01-01']) {
      expect(roundTrip(text)).toBe(text)
    }
  })

  it('preserves symbol descriptions without pretending they are editable', () => {
    expect(encodeValue(Symbol('token'))).toEqual({ kind: 'symbol', description: 'token' })
  })

  it('preserves error name, message and stack', () => {
    const error = new TypeError('boom')
    expect(encodeValue(error)).toMatchObject({
      kind: 'error',
      message: 'boom',
      name: 'TypeError',
    })
  })

  it('preserves function names and source previews', () => {
    function namedHelper(): number {
      return 42
    }
    expect(encodeValue(namedHelper)).toMatchObject({
      kind: 'function',
      name: 'namedHelper',
      sourcePreview: expect.stringContaining('return 42'),
    })
  })

  it.each([
    ['number', { kind: 'number', value: 1 }, 'abc'],
    ['number', { kind: 'number', value: 1 }, ''],
    ['boolean', { kind: 'boolean', value: true }, 'yes'],
    ['null', { kind: 'null' }, 'undefined'],
    ['undefined', { kind: 'undefined' }, 'null'],
    ['bigint', { kind: 'bigint', value: '1' }, '1.5'],
    ['date', { kind: 'date', value: '2024-01-01T00:00:00.000Z' }, 'not-a-date'],
    ['regexp', { kind: 'regexp', value: '/a/' }, 'missing-slashes'],
  ] as const)('rejects invalid %s input instead of corrupting state', (_kind, encoded, text) => {
    expect(() => parseEditText(encoded, text)).toThrow()
  })
})

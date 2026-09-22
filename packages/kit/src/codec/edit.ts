import type { EncodedValue } from './encode'

/**
 * Text shown in the state edit input for an encoded value. Paired with
 * `parseEditText` so every editable typed value round-trips: the text this
 * produces always parses back to a value that encodes to the same kind.
 */
export function formatEditText(value: EncodedValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value)
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value.value)
    case 'null':
    case 'undefined':
      return value.kind
    case 'date':
    case 'regexp':
      return value.value
    default:
      return ''
  }
}

/**
 * Parses edit input text back into a runtime value, keyed by the kind of the
 * value being edited so `"undefined"` (string) and `undefined` stay distinct.
 * Throws with a user-facing message on invalid input.
 */
export function parseEditText(value: EncodedValue, text: string): unknown {
  const normalized = text.trim()

  switch (value.kind) {
    case 'string':
      return parseEditableString(normalized)
    case 'number':
      return parseEditableNumber(normalized)
    case 'bigint':
      return parseEditableBigInt(normalized)
    case 'boolean':
      return parseEditableBoolean(normalized)
    case 'null':
      if (normalized !== 'null') throw new Error('Expected null')
      return null
    case 'undefined':
      if (normalized !== 'undefined') throw new Error('Expected undefined')
      return undefined
    case 'date':
      return parseEditableDate(parseEditableString(normalized))
    case 'regexp':
      return parseEditableRegExp(parseEditableString(normalized))
    default:
      return JSON.parse(normalized)
  }
}

function parseEditableString(value: string): string {
  if (!value) return ''
  if (value.startsWith('"')) return JSON.parse(value)
  return value
}

function parseEditableNumber(value: string): number {
  if (value === 'NaN') return Number.NaN
  if (value === 'Infinity') return Number.POSITIVE_INFINITY
  if (value === '-Infinity') return Number.NEGATIVE_INFINITY
  if (!value) throw new Error('Invalid number')

  const number = Number(value)
  if (Number.isNaN(number)) throw new Error('Invalid number')
  return number
}

function parseEditableBigInt(value: string): bigint {
  try {
    return BigInt(value.replace(/n$/, ''))
  } catch {
    throw new Error('Invalid bigint')
  }
}

function parseEditableBoolean(value: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('Expected true or false')
}

function parseEditableDate(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date')
  return date
}

function parseEditableRegExp(value: string): RegExp {
  const match = /^\/(.*)\/([dgimsuvy]*)$/.exec(value)
  if (!match) throw new Error('Expected /pattern/flags')
  return new RegExp(match[1], match[2])
}

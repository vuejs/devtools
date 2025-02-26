import { ESC, fnTypeRE, INFINITY, NAN, NEGATIVE_INFINITY, UNDEFINED } from './constants'
import { isComputed, isPlainObject, isPrimitive, isReactive, isReadOnly, isRef } from './is'

export const tokenMap = {
  [UNDEFINED]: 'undefined',
  [NAN]: 'NaN',
  [INFINITY]: 'Infinity',
  [NEGATIVE_INFINITY]: '-Infinity',
} as const

export const reversedTokenMap = Object.entries(tokenMap).reduce((acc, [key, value]) => {
  acc[value] = key
  return acc
}, {})

export function internalStateTokenToString(value: unknown) {
  if (value === null)
    return 'null'

  return (typeof value === 'string' && tokenMap[value]) || false
}

export function replaceTokenToString(value: string) {
  const replaceRegex = new RegExp(`"(${Object.keys(tokenMap).join('|')})"`, 'g')
  return value.replace(replaceRegex, (_, g1) => tokenMap[g1])
}

export function replaceStringToToken(value: string) {
  const literalValue = reversedTokenMap[value.trim()]
  if (literalValue)
    return `"${literalValue}"`

  // Match the token in value field and replace it with the literal value.
  const replaceRegex = new RegExp(`:\\s*(${Object.keys(reversedTokenMap).join('|')})`, 'g')
  return value.replace(replaceRegex, (_, g1) => `:"${reversedTokenMap[g1]}"`)
}

/**
 * Convert prop type constructor to string.
 */
export function getPropType(type: Array<string | null | Function | number> | string | null | Function | number) {
  if (Array.isArray(type))
    return type.map(t => getPropType(t)).join(' or ')

  if (type == null)
    return 'null'

  const match = type.toString().match(fnTypeRE)
  return typeof type === 'function'
    ? (match && match[1]) || 'any'
    : 'any'
}

/**
 * Sanitize data to be posted to the other side.
 * Since the message posted is sent with structured clone,
 * we need to filter out any types that might cause an error.
 */
export function sanitize(data: unknown) {
  if (
    !isPrimitive(data)
    && !Array.isArray(data)
    && !isPlainObject(data)
  ) {
    // handle types that will probably cause issues in
    // the structured clone
    return Object.prototype.toString.call(data)
  }
  else {
    return data
  }
}

export function getSetupStateType(raw) {
  try {
    return {
      ref: isRef(raw),
      computed: isComputed(raw),
      reactive: isReactive(raw),
      readonly: isReadOnly(raw),
    }
  }
  catch {
    return {
      ref: false,
      computed: false,
      reactive: false,
      readonly: false,
    }
  }
}

export function toRaw(value) {
  if (value?.__v_raw)
    return value.__v_raw

  return value
}

export function escape(s: string) {
  return s.replace(/[<>"&]/g, (s: string) => {
    return ESC[s] || s
  })
}

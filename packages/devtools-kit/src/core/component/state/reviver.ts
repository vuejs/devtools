import { target } from '@vue/devtools-shared'
import { activeAppRecord } from '../../../ctx'
import { INFINITY, NAN, NEGATIVE_INFINITY, specialTypeRE, symbolRE, UNDEFINED } from './constants'

export function reviveSet(val) {
  const result = new Set()
  const list = val._custom.value
  for (let i = 0; i < list.length; i++) {
    const value = list[i]
    result.add(revive(value))
  }
  return result
}

export function reviveMap(val) {
  const result = new Map()
  const list = val._custom.value
  for (let i = 0; i < list.length; i++) {
    const { key, value } = list[i]
    result.set(key, revive(value))
  }
  return result
}

export function revive(val) {
  if (val === UNDEFINED) {
    return undefined
  }
  else if (val === INFINITY) {
    return Number.POSITIVE_INFINITY
  }
  else if (val === NEGATIVE_INFINITY) {
    return Number.NEGATIVE_INFINITY
  }
  else if (val === NAN) {
    return Number.NaN
  }
  else if (val && val._custom) {
    const { _custom: custom } = val
    if (custom.type === 'component')
      return activeAppRecord.value.instanceMap.get(custom.id)
    else if (custom.type === 'map')
      return reviveMap(val)
    else if (custom.type === 'set')
      return reviveSet(val)
    else if (custom.type === 'bigint')
      return BigInt(custom.value)
    else
      return revive(custom.value)
  }
  else if (symbolRE.test(val)) {
    // @ts-expect-error skip type check
    const [, string] = symbolRE.exec(val)
    return Symbol.for(string)
  }
  else if (specialTypeRE.test(val)) {
    const [, type, string,, details] = specialTypeRE.exec(val)
    const result = new target[type](string)
    if (type === 'Error' && details)
      result.stack = details

    return result
  }
  else {
    return val
  }
}

export function reviver(key: string, value: unknown) {
  return revive(value)
}

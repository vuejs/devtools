import { ensurePropertyExists } from '../utils'
import { INFINITY, MAX_ARRAY_SIZE, MAX_STRING_SIZE, NAN, NEGATIVE_INFINITY, UNDEFINED } from './constants'
import { getBigIntDetails, getComponentDefinitionDetails, getDateDetails, getDurationDetails, getFunctionDetails, getHTMLElementDetails, getInstanceDetails, getMapDetails, getObjectDetails, getPlainDateDetails, getPlainDateTimeDetails, getPlainMonthDayDetails, getPlainTimeDetails, getPlainYearMonthDetails, getSetDetails, getStoreDetails, getZonedDateTimeDetails } from './custom'
import { isVueInstance } from './is'
import { sanitize } from './util'

export type Replacer = (this: any, key: string | number, value: any, depth?: number, seenInstance?: Map<any, /* depth */number>) => any

export function stringifyReplacer(key: string | number, _value: any, depth?: number, seenInstance?: Map<any, number>) {
  // fix vue warn for compilerOptions passing-options-to-vuecompiler-sfc
  // @TODO: need to check if it will cause any other issues
  if (key === 'compilerOptions')
    return

  // @ts-expect-error invalid this
  const val: unknown = this[key]
  // eslint-enable
  const type = typeof val
  if (Array.isArray(val)) {
    const l = val.length
    if (l > MAX_ARRAY_SIZE) {
      return {
        _isArray: true,
        length: l,
        items: val.slice(0, MAX_ARRAY_SIZE),
      }
    }
    return val
  }
  else if (typeof val === 'string') {
    if (val.length > MAX_STRING_SIZE)
      return `${val.substring(0, MAX_STRING_SIZE)}... (${(val.length)} total length)`

    else
      return val
  }
  else if (type === 'undefined') {
    return UNDEFINED
  }
  else if (val === Number.POSITIVE_INFINITY) {
    return INFINITY
  }
  else if (val === Number.NEGATIVE_INFINITY) {
    return NEGATIVE_INFINITY
  }
  else if (typeof val === 'function') {
    return getFunctionDetails(val)
  }
  else if (type === 'symbol') {
    return `[native Symbol ${Symbol.prototype.toString.call(val)}]`
  }
  else if (typeof val === 'bigint') {
    return getBigIntDetails(val)
  }
  else if (val !== null && typeof val === 'object') {
    const proto = Object.prototype.toString.call(val)
    if (proto === '[object Map]') {
      return getMapDetails(val as Map<string, unknown>)
    }
    else if (proto === '[object Set]') {
      return getSetDetails(val as Set<unknown>)
    }
    else if (proto === '[object RegExp]') {
      // special handling of native type
      return `[native RegExp ${RegExp.prototype.toString.call(val)}]`
    }
    else if (proto === '[object Date]') {
      return getDateDetails(val as Date)
    }
    else if (proto === '[object Temporal.PlainDate]') {
      return getPlainDateDetails(val as Temporal.PlainDate);
    }
    else if (proto === '[object Temporal.PlainDateTime]') {
      return getPlainDateTimeDetails(val as Temporal.PlainDateTime);
    }
    else if (proto === '[object Temporal.PlainTime]') {
      return getPlainTimeDetails(val as Temporal.PlainTime);
    }
    else if (proto === '[object Temporal.ZonedDateTime]') {
      return getZonedDateTimeDetails(val as Temporal.ZonedDateTime);
    }
    else if (proto === '[object Temporal.Duration]') {
      return getDurationDetails(val as Temporal.Duration);
    }
    else if (proto === '[object Temporal.PlainMonthDay]') {
      return getPlainMonthDayDetails(val as Temporal.PlainMonthDay);
    }
    else if (proto === '[object Temporal.PlainYearMonth]') {
      return getPlainYearMonthDetails(val as Temporal.PlainYearMonth);
    }
    else if (proto === '[object Error]') {
      return `[native Error ${(val as Error).message}<>${(val as Error).stack}]`
    }
    else if (ensurePropertyExists(val, 'state', true) && ensurePropertyExists(val, '_vm', true)) {
      return getStoreDetails(val)
    }
    else if (isVueInstance(val as Record<string, unknown>)) {
      const componentVal = getInstanceDetails(val)
      const parentInstanceDepth = seenInstance?.get(val)
      if (parentInstanceDepth && parentInstanceDepth < depth!) {
        return `[[CircularRef]] <${componentVal._custom.displayText}>`
      }
      seenInstance?.set(val, depth!)
      return componentVal
    }
    else if (ensurePropertyExists(val, 'render', true) && typeof val.render === 'function') {
      return getComponentDefinitionDetails(val)
    }
    else if (val.constructor && val.constructor.name === 'VNode') {
    // @ts-expect-error skip type check
      return `[native VNode <${val.tag}>]`
    }
    else if (typeof HTMLElement !== 'undefined' && val instanceof HTMLElement) {
      return getHTMLElementDetails(val)
    }
    else if (val.constructor?.name === 'Store' && '_wrappedGetters' in val) {
      return '[object Store]'
    }
    const customDetails = getObjectDetails(val)
    if (customDetails != null)
      return customDetails
  }
  else if (Number.isNaN(val)) {
    return NAN
  }
  return sanitize(val)
}

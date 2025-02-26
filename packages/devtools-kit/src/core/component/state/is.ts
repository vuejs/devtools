import { ensurePropertyExists } from '../utils'

export function isVueInstance(value: any) {
  if (!ensurePropertyExists(value, '_')) {
    return false
  }
  if (!isPlainObject(value._)) {
    return false
  }
  return Object.keys(value._).includes('vnode')
}

export function isPlainObject(obj: unknown): obj is object {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

export function isPrimitive(data: unknown) {
  if (data == null)
    return true

  const type = typeof data
  return (
    type === 'string'
    || type === 'number'
    || type === 'boolean'
  )
}

export function isRef(raw): boolean {
  return !!raw.__v_isRef
}

export function isComputed(raw): boolean {
  return isRef(raw) && !!raw.effect
}

export function isReactive(raw): boolean {
  return !!raw.__v_isReactive
}

export function isReadOnly(raw): boolean {
  return !!raw.__v_isReadonly
}

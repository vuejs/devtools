import { isVueInstance } from '../core/component/state/is'
import { Replacer } from '../core/component/state/replacer'

const MAX_SERIALIZED_SIZE = 2 * 1024 * 1024 // 2MB

function isObject(_data: unknown, proto: string): _data is Record<string, unknown> {
  return proto === '[object Object]'
}

function isArray(_data: unknown, proto: string): _data is unknown[] {
  return proto === '[object Array]'
}

// See https://github1s.com/vuejs/core/blob/HEAD/packages/reactivity/src/dep.ts#L32-L33
function isVueReactiveLinkNode(node) {
  const constructorName = node?.constructor?.name
  return (constructorName === 'Dep' && 'activeLink' in node) || (constructorName === 'Link' && 'dep' in node)
}

/**
 * This function is used to serialize object with handling circular references.
 *
 * ```ts
 * const obj = { a: 1, b: { c: 2 }, d: obj }
 * const result = stringifyCircularAutoChunks(obj) // call `encode` inside
 * console.log(result) // [{"a":1,"b":2,"d":0},1,{"c":4},2]
 * ```
 *
 * Each object is stored in a list and the index is used to reference the object.
 * With seen map, we can check if the object is already stored in the list to avoid circular references.
 *
 * Note: here we have a special case for Vue instance.
 * We check if a vue instance includes itself in its properties and skip it
 * by using `seenVueInstance` and `depth` to avoid infinite loop.
 */
function encode(data: unknown, replacer: Replacer | null, list: unknown[], seen: Map<unknown, number>, depth = 0, seenVueInstance = new Map<any, number>()): number {
  let stored: Record<string, number> | number[]
  let key: string
  let value: unknown
  let i: number
  let l: number

  const seenIndex = seen.get(data)
  if (seenIndex != null)
    return seenIndex

  const index = list.length
  const proto = Object.prototype.toString.call(data)
  if (isObject(data, proto)) {
    if (isVueReactiveLinkNode(data)) {
      return index
    }
    stored = {}
    seen.set(data, index)
    list.push(stored)
    const keys = Object.keys(data)
    for (i = 0, l = keys.length; i < l; i++) {
      key = keys[i]
      // fix vue warn for compilerOptions passing-options-to-vuecompiler-sfc
      // @TODO: need to check if it will cause any other issues
      if (key === 'compilerOptions')
        return index
      value = data[key]
      const isVm = value != null && isObject(value, Object.prototype.toString.call(data)) && isVueInstance(value)
      try {
        if (replacer) {
          value = replacer.call(data, key, value, depth, seenVueInstance)
        }
      }
      catch (e) {
        value = e
      }
      stored[key] = encode(value, replacer, list, seen, depth + 1, seenVueInstance)
      // delete vue instance if its properties have been processed
      if (isVm) {
        seenVueInstance.delete(value)
      }
    }
  }
  else if (isArray(data, proto)) {
    stored = []
    seen.set(data, index)
    list.push(stored)
    for (i = 0, l = data.length; i < l; i++) {
      try {
        value = data[i]
        if (replacer)
          value = replacer.call(data, i, value, depth, seenVueInstance)
      }
      catch (e) {
        value = e
      }
      stored[i] = encode(value, replacer, list, seen, depth + 1, seenVueInstance)
    }
  }
  else {
    list.push(data)
  }
  return index
}

function decode(list: unknown[] | string, reviver: ((this: any, key: string, value: any) => any) | null = null) {
  let i = list.length
  let j, k, data, key, value, proto
  while (i--) {
    data = list[i]
    proto = Object.prototype.toString.call(data)
    if (proto === '[object Object]') {
      const keys = Object.keys(data)
      for (j = 0, k = keys.length; j < k; j++) {
        key = keys[j]
        value = list[data[key]]
        if (reviver)
          value = reviver.call(data, key, value)
        data[key] = value
      }
    }
    else if (proto === '[object Array]') {
      for (j = 0, k = data.length; j < k; j++) {
        value = list[data[j]]
        if (reviver)
          value = reviver.call(data, j, value)
        data[j] = value
      }
    }
  }
}

export function stringifyCircularAutoChunks(data: Record<string, unknown>, replacer: Replacer | null = null, space: number | null = null) {
  let result: string
  try {
    // no circular references, JSON.stringify can handle this
    result = arguments.length === 1
      ? JSON.stringify(data)
      // @ts-expect-error skip type check
      : JSON.stringify(data, (k, v) => replacer?.(k, v)?.call(this), space!)
  }
  catch (e) {
    // handle circular references
    result = stringifyStrictCircularAutoChunks(data, replacer!, space!)
  }
  if (result.length > MAX_SERIALIZED_SIZE) {
    const chunkCount = Math.ceil(result.length / MAX_SERIALIZED_SIZE)
    const chunks: string[] = []
    for (let i = 0; i < chunkCount; i++)
      chunks.push(result.slice(i * MAX_SERIALIZED_SIZE, (i + 1) * MAX_SERIALIZED_SIZE))

    return chunks
  }
  return result
}

export function stringifyStrictCircularAutoChunks(data: Record<string, unknown>, replacer: Replacer | null = null, space: number | null = null) {
  const list = []
  encode(data, replacer, list, new Map())
  return space
    ? ` ${JSON.stringify(list, null, space)}`
    : ` ${JSON.stringify(list)}`
}

export function parseCircularAutoChunks(data: unknown[] | string, reviver: ((this: any, key: string, value: any) => any) | null = null) {
  if (Array.isArray(data))
    data = data.join('')

  const hasCircular = /^\s/.test(data)
  if (!hasCircular) {
    return arguments.length === 1
      ? JSON.parse(data)
      // @ts-expect-error skip
      : JSON.parse(data, reviver)
  }
  else {
    const list = JSON.parse(data)
    decode(list, reviver)
    return list[0]
  }
}

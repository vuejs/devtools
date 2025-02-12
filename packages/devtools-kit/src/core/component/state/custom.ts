import type { customTypeEnums, InspectorState } from '../types'
import { ensurePropertyExists, getComponentName, getInstanceName } from '../utils'
import { processInstanceState } from './process'
import { escape, getSetupStateType, toRaw } from './util'

export function getFunctionDetails(func: Function) {
  let string = ''
  let matches: RegExpMatchArray | null = null
  try {
    string = Function.prototype.toString.call(func)
    matches = String.prototype.match.call(string, /\([\s\S]*?\)/)
  }
  catch (e) {
    // Func is probably a Proxy, which can break Function.prototype.toString()
  }
  // Trim any excess whitespace from the argument string
  const match = matches && matches[0]
  const args = typeof match === 'string'
    ? match
    : '(?)'
  const name = typeof func.name === 'string' ? func.name : ''
  return {
    _custom: {
      type: 'function' satisfies customTypeEnums,
      displayText: `<span style="opacity:.8;margin-right:5px;">function</span> <span style="white-space:nowrap;">${escape(name)}${args}</span>`,
      tooltipText: string.trim() ? `<pre>${string}</pre>` : null,
    },
  }
}

export function getBigIntDetails(val: bigint | bigint) {
  const stringifiedBigInt = BigInt.prototype.toString.call(val)
  return {
    _custom: {
      type: 'bigint',
      displayText: `BigInt(${stringifiedBigInt})`,
      value: stringifiedBigInt,
    },
  }
}

export function getDateDetails(val: Date) {
  const date = new Date(val.getTime())
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())

  return {
    _custom: {
      type: 'date',
      displayText: Date.prototype.toString.call(val),
      value: date.toISOString().slice(0, -1),
    },
  }
}

export function getMapDetails(val: Map<string, unknown>) {
  const list: Record<string, unknown> = Object.fromEntries(val)
  return {
    _custom: {
      type: 'map',
      displayText: 'Map',
      value: list,
      readOnly: true,
      fields: {
        abstract: true,
      },
    },
  }
}

export function getSetDetails(val: Set<unknown>) {
  const list = Array.from(val)
  return {
    _custom: {
      type: 'set' satisfies customTypeEnums,
      displayText: `Set[${list.length}]`,
      value: list,
      readOnly: true,
    },
  }
}

function getCaughtGetters(store) {
  const getters = {}

  const origGetters = store.getters || {}
  const keys = Object.keys(origGetters)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    Object.defineProperty(getters, key, {
      enumerable: true,
      get: () => {
        try {
          return origGetters[key]
        }
        catch (e) {
          return e
        }
      },
    })
  }

  return getters
}

function reduceStateList(list: InspectorState[]) {
  if (!list.length)
    return undefined

  return list.reduce((map, item) => {
    const key = (item.type || 'data') as string
    const obj = map[key] = map[key] || {}
    obj[item.key as string] = item.value
    return map
  }, {})
}

function namedNodeMapToObject(map: NamedNodeMap) {
  const result: Record<string, unknown> = {}
  const l = map.length
  for (let i = 0; i < l; i++) {
    const node = map.item(i)
    result[node!.name] = node!.value
  }
  return result
}

export function getStoreDetails(store) {
  return {
    _custom: {
      type: 'store' satisfies customTypeEnums,
      displayText: 'Store',
      value: {
        state: store.state,
        getters: getCaughtGetters(store),
      },
      fields: {
        abstract: true,
      },
    },
  }
}

export function getRouterDetails(router) {
  return {
    _custom: {
      type: 'router',
      displayText: 'VueRouter',
      value: {
        options: router.options,
        currentRoute: router.currentRoute,
      },
      fields: {
        abstract: true,
      },
    },
  }
}

// @TODO: fix circular dependency
export function getInstanceDetails(instance) {
  if (instance._)
    instance = instance._
  const state = processInstanceState(instance)
  return {
    _custom: {
      type: 'component',
      id: instance.__VUE_DEVTOOLS_NEXT_UID__,
      displayText: getInstanceName(instance),
      tooltipText: 'Component instance',
      value: reduceStateList(state),
      fields: {
        abstract: true,
      },
    },
  }
}

export function getComponentDefinitionDetails(definition) {
  let display = getComponentName(definition)
  if (display) {
    if (definition.name && definition.__file)
      display += ` <span>(${definition.__file})</span>`
  }
  else {
    display = '<i>Unknown Component</i>'
  }
  return {
    _custom: {
      type: 'component-definition' satisfies customTypeEnums,
      displayText: display,
      tooltipText: 'Component definition',
      ...definition.__file
        ? {
            file: definition.__file,
          }
        : {},
    },
  }
}

export function getHTMLElementDetails(value: HTMLElement) {
  try {
    return {
      _custom: {
        type: 'HTMLElement' satisfies customTypeEnums,
        displayText: `<span class="opacity-30">&lt;</span><span class="text-blue-500">${value.tagName.toLowerCase()}</span><span class="opacity-30">&gt;</span>`,
        value: namedNodeMapToObject(value.attributes),
      },
    }
  }
  catch (e) {
    return {
      _custom: {
        type: 'HTMLElement' satisfies customTypeEnums,
        displayText: `<span class="text-blue-500">${String(value)}</span>`,
      },
    }
  }
}

/**
 * - ObjectRefImpl, toRef({ foo: 'foo' }, 'foo'), `_value` is the actual value, (since 3.5.0)
 * - GetterRefImpl, toRef(() => state.foo), `_value` is the actual value, (since 3.5.0)
 * - RefImpl, ref('foo') / computed(() => 'foo'), `_value` is the actual value
 */
function tryGetRefValue(ref: { _value?: unknown } | { value?: unknown }) {
  if (ensurePropertyExists<{ _value?: unknown }>(ref, '_value', true)) {
    return ref._value
  }
  if (ensurePropertyExists(ref, 'value', true)) {
    return ref.value
  }
}

export function getObjectDetails(object: Record<string, any>) {
  const info = getSetupStateType(object)

  const isState = info.ref || info.computed || info.reactive
  if (isState) {
    const stateTypeName = info.computed ? 'Computed' : info.ref ? 'Ref' : info.reactive ? 'Reactive' : null
    const value = toRaw(info.reactive ? object : tryGetRefValue(object))

    const raw = ensurePropertyExists(object, 'effect')
      ? object.effect?.raw?.toString() || object.effect?.fn?.toString()
      : null

    return {
      _custom: {
        type: stateTypeName?.toLowerCase(),
        stateTypeName,
        value,
        ...raw ? { tooltipText: `<span class="font-mono">${raw}</span>` } : {},
      },
    }
  }

  if (ensurePropertyExists(object, '__asyncLoader') && typeof object.__asyncLoader === 'function') {
    return {
      _custom: {
        type: 'component-definition' satisfies customTypeEnums,
        display: 'Async component definition',
      },
    }
  }
}

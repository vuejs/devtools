import type { VueAppInstance } from '../../../types'
import type { InspectorState } from '../types'
import { camelize } from '@vue/devtools-shared'
import { ensurePropertyExists, returnError } from '../utils'
import { vueBuiltins } from './constants'
import { getPropType, getSetupStateType, toRaw } from './util'

function mergeOptions(
  to: any,
  from: any,
  instance: VueAppInstance,
) {
  if (typeof from === 'function')
    from = from.options

  if (!from)
    return to

  const { mixins, extends: extendsOptions } = from

  extendsOptions && mergeOptions(to, extendsOptions, instance)
  mixins
  && mixins.forEach(m =>
    mergeOptions(to, m, instance),
  )

  for (const key of ['computed', 'inject']) {
    if (Object.prototype.hasOwnProperty.call(from, key)) {
      if (!to[key])
        to[key] = from[key]

      else
        Object.assign(to[key], from[key])
    }
  }
  return to
}

// @TODO: maybe should be exported from vue core?
function resolveMergedOptions(
  instance: VueAppInstance,
) {
  const raw = instance?.type
  if (!raw)
    return {}
  const { mixins, extends: extendsOptions } = raw
  const globalMixins = instance.appContext.mixins
  if (!globalMixins.length && !mixins && !extendsOptions)
    return raw
  const options = {}
  globalMixins.forEach(m => mergeOptions(options, m, instance))
  mergeOptions(options, raw, instance)
  return options
}

/**
 * Process the props of an instance.
 * Make sure return a plain object because window.postMessage()
 * will throw an Error if the passed object contains Functions.
 *
 */
function processProps(instance: VueAppInstance) {
  const props: InspectorState[] = []
  const propDefinitions = instance?.type?.props

  for (const key in instance.props) {
    const propDefinition = propDefinitions ? propDefinitions[key] : null
    const camelizeKey = camelize(key)
    props.push({
      type: 'props',
      key: camelizeKey,
      value: returnError(() => instance.props[key]),
      editable: true,
      meta: propDefinition
        ? {
            type: propDefinition.type ? getPropType(propDefinition.type) : 'any',
            required: !!propDefinition.required,
            ...propDefinition.default
              ? {
                  default: propDefinition.default.toString(),
                }
              : {},
          }
        : { type: 'invalid' },
    })
  }

  return props
}

/**
 * Process state, filtering out props and "clean" the result
 * with a JSON dance. This removes functions which can cause
 * errors during structured clone used by window.postMessage.
 *
 */
function processState(instance: VueAppInstance) {
  const type = instance.type
  const props = type.props
  const getters
    = type.vuex
    && type.vuex.getters
  const computedDefs = type.computed

  const data = {
    ...instance.data,
    ...instance.renderContext,
  }

  return Object.keys(data)
    .filter(key => (
      !(props && key in props)
      && !(getters && key in getters)
      && !(computedDefs && key in computedDefs)
    ))
    .map(key => ({
      key,
      type: 'data',
      value: returnError(() => data[key]),
      editable: true,
    }))
}

function getStateTypeAndName(info: ReturnType<typeof getSetupStateType>) {
  // the order is important !!!
  const stateType = info.computed ? 'computed' : info.ref ? 'ref' : info.reactive ? 'reactive' : null
  const stateTypeName = stateType ? `${stateType.charAt(0).toUpperCase()}${stateType.slice(1)}` : null
  return {
    stateType,
    stateTypeName,
  }
}

function processSetupState(instance: VueAppInstance) {
  const raw = instance.devtoolsRawSetupState || {}
  return Object.keys(instance.setupState)
    .filter(key => !vueBuiltins.has(key) && key.split(/(?=[A-Z])/)[0] !== 'use')
    .map((key) => {
      const value = returnError(() => toRaw(instance.setupState[key])) as unknown as {
        render: Function
        __asyncLoader: Function

      }

      const rawData = raw[key] as {
        effect: {
          raw: Function
          fn: Function
        }
      }

      let result: Partial<InspectorState>

      let isOtherType = typeof value === 'function'
        || (ensurePropertyExists(value, 'render') && typeof value.render === 'function') // Components
        || (ensurePropertyExists(value, '__asyncLoader') && typeof value.__asyncLoader === 'function') // Components
        || (typeof value === 'object' && value && ('setup' in value || 'props' in value)) // Components
        || /^v[A-Z]/.test(key) // Directives

      if (rawData) {
        const info = getSetupStateType(rawData)

        const { stateType, stateTypeName } = getStateTypeAndName(info)
        const isState = info.ref || info.computed || info.reactive
        const raw = ensurePropertyExists(rawData, 'effect')
          ? rawData.effect?.raw?.toString() || rawData.effect?.fn?.toString()
          : null

        if (stateType)
          isOtherType = false

        result = {
          ...stateType ? { stateType, stateTypeName: stateTypeName! } : {},
          ...raw ? { raw } : {},
          editable: isState && !info.readonly,
        }
      }

      const type = isOtherType ? 'setup (other)' : 'setup'

      return {
        key,
        value,
        type,
        // @ts-expect-error ignore
        ...result,
      } satisfies InspectorState
    })
}

/**
 * Process the computed properties of an instance.
 */
function processComputed(instance: VueAppInstance, mergedType: Record<string, unknown>) {
  const type = mergedType
  const computed: InspectorState[] = []
  const defs = type.computed || {}
  // use for...in here because if 'computed' is not defined
  // on component, computed properties will be placed in prototype
  // and Object.keys does not include
  // properties from object's prototype
  for (const key in defs) {
    const def = defs[key]
    const type = typeof def === 'function' && def.vuex
      ? 'vuex bindings'
      : 'computed'
    computed.push({
      type,
      key,
      value: returnError(() => instance?.proxy?.[key]),
      editable: typeof def.set === 'function',
    })
  }

  return computed
}

function processAttrs(instance: VueAppInstance) {
  return Object.keys(instance.attrs)
    .map(key => ({
      type: 'attrs',
      key,
      value: returnError(() => instance.attrs[key]),
    }))
}

function processProvide(instance: VueAppInstance) {
  return Reflect.ownKeys(instance.provides)
    .map(key => ({
      type: 'provided',
      key: key.toString(),
      value: returnError(() => instance.provides[key]),
    }))
}

function processInject(instance: VueAppInstance, mergedType: Record<string, unknown>) {
  if (!mergedType?.inject)
    return []
  let keys: any[] = []
  let defaultValue
  if (Array.isArray(mergedType.inject)) {
    keys = mergedType.inject.map(key => ({
      key,
      originalKey: key,
    }))
  }
  else {
    keys = Reflect.ownKeys(mergedType.inject).map((key) => {
      const value = (mergedType.inject as Record<symbol, unknown>)[key]
      let originalKey
      if (typeof value === 'string' || typeof value === 'symbol') {
        originalKey = value
      }
      else {
        originalKey = value.from
        defaultValue = value.default
      }
      return {
        key,
        originalKey,
      }
    })
  }
  return keys.map(({ key, originalKey }) => ({
    type: 'injected',
    key: originalKey && key !== originalKey ? `${originalKey.toString()} ➞ ${key.toString()}` : key.toString(),
    // eslint-disable-next-line no-prototype-builtins
    value: returnError(() => instance.ctx.hasOwnProperty(key) ? instance.ctx[key] : instance.provides.hasOwnProperty(originalKey) ? instance.provides[originalKey] : defaultValue),
  }))
}

function processRefs(instance: VueAppInstance) {
  return Object.keys(instance.refs)
    .map(key => ({
      type: 'template refs',
      key,
      value: returnError(() => instance.refs[key]),
    }))
}

function processEventListeners(instance: VueAppInstance) {
  const emitsDefinition = instance.type.emits
  const declaredEmits = Array.isArray(emitsDefinition) ? emitsDefinition : Object.keys(emitsDefinition ?? {})
  const keys = Object.keys(instance?.vnode?.props ?? {})
  const result: InspectorState[] = []
  for (const key of keys) {
    const [prefix, ...eventNameParts] = key.split(/(?=[A-Z])/)
    if (prefix === 'on') {
      const eventName = eventNameParts.join('-').toLowerCase()
      const isDeclared = declaredEmits.includes(eventName)
      result.push({
        type: 'event listeners',
        key: eventName,
        value: {
          _custom: {
            displayText: isDeclared ? '✅ Declared' : '⚠️ Not declared',
            key: isDeclared ? '✅ Declared' : '⚠️ Not declared',
            value: isDeclared ? '✅ Declared' : '⚠️ Not declared',
            tooltipText: !isDeclared ? `The event <code>${eventName}</code> is not declared in the <code>emits</code> option. It will leak into the component's attributes (<code>$attrs</code>).` : null,
          },
        },
      })
    }
  }
  return result
}

export function processInstanceState(instance: VueAppInstance) {
  const mergedType = resolveMergedOptions(instance)
  return processProps(instance).concat(
    processState(instance),
    processSetupState(instance),
    processComputed(instance, mergedType),
    processAttrs(instance),
    processProvide(instance),
    processInject(instance, mergedType),
    processRefs(instance),
    processEventListeners(instance),
  )
}

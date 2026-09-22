import {
  readObject,
  hasOwn,
  readObjectValue,
  toRaw,
  readBoolean,
  readUnknownProperty,
} from './shared'
import type { InstanceRef } from '../types'

const vueBuiltins = new Set([
  'nextTick',
  'defineComponent',
  'defineAsyncComponent',
  'defineCustomElement',
  'ref',
  'computed',
  'reactive',
  'readonly',
  'watchEffect',
  'watchPostEffect',
  'watchSyncEffect',
  'watch',
  'isRef',
  'unref',
  'toRef',
  'toRefs',
  'isProxy',
  'isReactive',
  'isReadonly',
  'shallowRef',
  'triggerRef',
  'customRef',
  'shallowReactive',
  'shallowReadonly',
  'toRaw',
  'markRaw',
  'effectScope',
  'getCurrentScope',
  'onScopeDispose',
  'onMounted',
  'onUpdated',
  'onUnmounted',
  'onBeforeMount',
  'onBeforeUpdate',
  'onBeforeUnmount',
  'onErrorCaptured',
  'onRenderTracked',
  'onRenderTriggered',
  'onActivated',
  'onDeactivated',
  'onServerPrefetch',
  'provide',
  'inject',
  'h',
  'mergeProps',
  'cloneVNode',
  'isVNode',
  'resolveComponent',
  'resolveDirective',
  'withDirectives',
  'withModifiers',
])

export function isUserSetupKey(key: string): boolean {
  return (
    !!key &&
    key[0] !== '$' &&
    key[0] !== '_' &&
    !vueBuiltins.has(key) &&
    key.split(/(?=[A-Z])/)[0] !== 'use'
  )
}

/**
 * Merge bindings Vue stores on the instance: SFC `devtoolsRawSetupState`,
 * object-returning `setupState`, and `expose()`. Setup that only returns a
 * render function keeps refs in the closure; those cannot be collected
 * (vuejs/devtools#376, #853).
 */
export function collectSetupBindings(
  record: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const bindings: Record<string, unknown> = {}
  const props = readObject(record, 'props')

  for (const source of setupBindingSources(record)) {
    if (!source) continue
    for (const key of Object.keys(source)) {
      if (key in bindings || !isUserSetupKey(key) || (props && hasOwn(props, key))) continue
      bindings[key] = readObjectValue(source, key)
    }
  }

  return Object.keys(bindings).length ? bindings : undefined
}

export function findSetupEditTarget(
  record: Record<string, unknown>,
  key: string | undefined,
): object | undefined {
  for (const source of setupBindingSources(record)) {
    if (!source) continue
    if (!key || hasOwn(source, key)) return source
  }
}

export function setupBindingSources(record: Record<string, unknown>): Array<object | undefined> {
  return [
    readObject(record, 'devtoolsRawSetupState'),
    asObject(toRaw(readObject(record, 'setupState'))),
    readObject(record, 'exposed'),
  ]
}

function asObject(value: unknown): object | undefined {
  return value != null && typeof value === 'object' ? (value as object) : undefined
}

export function isInstanceUnmounted(instance: InstanceRef): boolean {
  const record = instance as Record<string, unknown>
  return (
    readBoolean(record, 'isUnmounted') === true ||
    readBoolean(record, 'isUnmounting') === true ||
    readBoolean(record, '_isBeingDestroyed') === true
  )
}

export function getSetupStateType(value: unknown): {
  ref: boolean
  computed: boolean
  reactive: boolean
  readonly: boolean
} {
  if (value == null || typeof value !== 'object') {
    return {
      ref: false,
      computed: false,
      reactive: false,
      readonly: false,
    }
  }

  const ref = readBoolean(value, '__v_isRef') ?? false
  return {
    ref,
    computed:
      ref &&
      (!!readObject(value, 'effect') || typeof readUnknownProperty(value, 'fn') === 'function'),
    reactive: readBoolean(value, '__v_isReactive') ?? false,
    readonly: readBoolean(value, '__v_isReadonly') ?? false,
  }
}

export function resolveMergedOptions(instance: InstanceRef): object | undefined {
  const record = instance as Record<string, unknown>
  const raw = readObject(record, 'type')
  if (!raw) return

  const globalMixins = readUnknownProperty(readObject(record, 'appContext') ?? {}, 'mixins')
  const mixins = Array.isArray(globalMixins) ? globalMixins : []
  const ownMixins = readUnknownProperty(raw, 'mixins')
  const extendsOptions = readUnknownProperty(raw, 'extends')

  if (!mixins.length && !ownMixins && !extendsOptions) return raw

  const options: Record<string, unknown> = {}
  mixins.forEach((mixin) => {
    if (mixin != null && (typeof mixin === 'object' || typeof mixin === 'function'))
      mergeOptions(options, mixin)
  })
  mergeOptions(options, raw)
  return options
}

function mergeOptions(to: Record<string, unknown>, from: object | Function | undefined): void {
  if (typeof from === 'function') {
    const options = readUnknownProperty(from, 'options')
    from = options != null && typeof options === 'object' ? options : undefined
  }
  if (!from) return

  const extendsOptions = readUnknownProperty(from, 'extends')
  if (
    extendsOptions != null &&
    (typeof extendsOptions === 'object' || typeof extendsOptions === 'function')
  )
    mergeOptions(to, extendsOptions)

  const mixins = readUnknownProperty(from, 'mixins')
  if (Array.isArray(mixins)) {
    mixins.forEach((mixin) => {
      if (mixin != null && (typeof mixin === 'object' || typeof mixin === 'function'))
        mergeOptions(to, mixin)
    })
  }

  for (const key of ['computed', 'inject']) {
    if (!hasOwn(from, key)) continue
    const current = readObject(to, key)
    const next = readObject(from, key)
    if (!current || !next) {
      to[key] = readUnknownProperty(from, key)
    } else {
      to[key] = Object.assign(Object.create(null), current, next)
    }
  }

  if (!hasOwn(to, 'props') && hasOwn(from, 'props')) to.props = readUnknownProperty(from, 'props')
  if (!hasOwn(to, 'vuex') && hasOwn(from, 'vuex')) to.vuex = readUnknownProperty(from, 'vuex')
}

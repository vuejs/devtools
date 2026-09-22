import {
  readObject,
  hasOwn,
  readObjectValue,
  readUnknownProperty,
  asDependencyLink,
} from './shared'
import { createNotAccessedComputedCustomValue, isComputedRef } from '../../codec'
import type { DependencyLink } from './shared'
import type { InstanceRef } from '../types'
import { setupBindingSources, resolveMergedOptions } from './instance'

export function createComputedReader(
  computed: object,
  proxy: object | undefined,
  record: Record<string, unknown>,
): object {
  const reader: Record<string, unknown> = {}
  const ctx = readObject(record, 'ctx')
  const sample = findComputedRefSample(record)

  for (const key of Reflect.ownKeys(computed)) {
    if (typeof key !== 'string') continue
    Object.defineProperty(reader, key, {
      enumerable: true,
      get() {
        return readOptionsComputedValue(ctx, proxy, key, sample)
      },
    })
  }

  return reader
}

function readOptionsComputedValue(
  ctx: object | undefined,
  proxy: object | undefined,
  key: string,
  sample: object | undefined,
): unknown {
  return readComputedPropertyWithoutEvaluating(sample, () => {
    if (ctx && hasOwn(ctx, key)) return readObjectValue(ctx, key)
    return proxy ? readObjectValue(proxy, key) : undefined
  })
}

function readComputedPropertyWithoutEvaluating(
  sample: object | undefined,
  read: () => unknown,
): unknown {
  if (!sample) return createNotAccessedComputedCustomValue()

  const proto = Object.getPrototypeOf(sample)
  if (proto == null || proto === Object.prototype) return read()

  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (!descriptor || typeof descriptor.get !== 'function' || descriptor.configurable === false) {
    return read()
  }

  let captured: object | undefined
  const captureComputedTarget = (target: object): object => {
    captured = target
    return target
  }
  Object.defineProperty(proto, 'value', {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get() {
      return captureComputedTarget(this)
    },
  })
  try {
    read()
    return captured ?? createNotAccessedComputedCustomValue()
  } catch (error) {
    if (captured) return captured
    throw error
  } finally {
    Object.defineProperty(proto, 'value', descriptor)
  }
}

function findComputedRefSample(record: Record<string, unknown>): object | undefined {
  const rawSetupState = readObject(record, 'devtoolsRawSetupState')
  if (rawSetupState) {
    for (const key of Object.keys(rawSetupState)) {
      const value = readObjectValue(rawSetupState, key)
      if (isComputedRef(value)) return value
    }
  }

  const fromRender = findComputedRefInEffect(readObject(record, 'effect'))
  if (fromRender) return fromRender

  const scope = readObject(record, 'scope')
  const effects = scope ? readUnknownProperty(scope, 'effects') : undefined
  if (!Array.isArray(effects)) return

  for (const effect of effects) {
    if (effect == null || typeof effect !== 'object') continue
    const found = findComputedRefInEffect(effect)
    if (found) return found
  }
}

function findComputedRefInEffect(effect: object | undefined): object | undefined {
  if (!effect) return

  const deps = readUnknownProperty(effect, 'deps')
  if (Array.isArray(deps)) {
    for (const dep of deps) {
      if (dep == null || typeof dep !== 'object') continue
      const computed = readObject(dep, 'computed')
      if (computed && isComputedRef(computed)) return computed
    }
    return
  }

  let link = asDependencyLink(deps)
  const seen = new Set<DependencyLink>()
  while (link && !seen.has(link)) {
    seen.add(link)
    const computed = readObject(readObject(link, 'dep') ?? {}, 'computed')
    if (computed && isComputedRef(computed)) return computed
    link = link.nextDep
  }
}

export function resolveComputedRef(
  instance: InstanceRef,
  sectionId: string,
  path: string[],
): object | undefined {
  if (path.length !== 1) return
  const key = path[0]
  if (!key) return

  const record = instance as Record<string, unknown>
  if (sectionId === 'setup' || sectionId === 'setup-other') {
    for (const source of setupBindingSources(record)) {
      const value = source ? readObjectValue(source, key) : undefined
      if (isComputedRef(value)) return value
    }
    return
  }

  if (sectionId === 'computed') return resolveOptionsApiComputedRef(record, key)
}

function resolveOptionsApiComputedRef(
  record: Record<string, unknown>,
  key: string,
): object | undefined {
  const computedOptions = readObject(resolveMergedOptions(record as InstanceRef), 'computed')
  if (!computedOptions || !hasOwn(computedOptions, key)) return

  const definition = readObjectValue(computedOptions, key)
  const getter =
    typeof definition === 'function'
      ? definition
      : definition != null && typeof definition === 'object'
        ? readUnknownProperty(definition, 'get')
        : undefined

  const setupComputed = new Set<object>()
  const rawSetupState = readObject(record, 'devtoolsRawSetupState')
  if (rawSetupState) {
    for (const setupKey of Object.keys(rawSetupState)) {
      const value = readObjectValue(rawSetupState, setupKey)
      if (isComputedRef(value)) setupComputed.add(value)
    }
  }

  const candidates = collectLiveComputedRefs(record).filter((value) => !setupComputed.has(value))
  const named = candidates.filter((value) => {
    const fn = readComputedGetter(value)
    return typeof fn === 'function' && (fn.name === key || fn.name === `bound ${key}`)
  })
  if (named.length === 1) return named[0]

  const sourced =
    typeof getter === 'function'
      ? candidates.filter((value) => {
          const fn = readComputedGetter(value)
          return typeof fn === 'function' && fn.toString() === getter.toString()
        })
      : []
  if (sourced.length === 1) return sourced[0]

  const optionKeys = Reflect.ownKeys(computedOptions).filter(
    (item): item is string => typeof item === 'string',
  )
  const index = optionKeys.indexOf(key)
  return index >= 0 ? candidates[index] : undefined
}

function collectLiveComputedRefs(record: Record<string, unknown>): object[] {
  const found = new Set<object>()
  const seenSubscribers = new Set<object>()
  const scopeEffects = readUnknownProperty(readObject(record, 'scope') ?? {}, 'effects')
  const queue: unknown[] = [
    ...(Array.isArray(scopeEffects) ? scopeEffects : []),
    readUnknownProperty(record, 'effect'),
    readUnknownProperty(record, 'update'),
  ]

  for (const subscriber of queue) walkComputedSubscriber(subscriber, found, seenSubscribers)
  return [...found]
}

function walkComputedSubscriber(
  subscriber: unknown,
  found: Set<object>,
  seenSubscribers: Set<object>,
): void {
  if (subscriber == null || typeof subscriber !== 'object' || seenSubscribers.has(subscriber))
    return
  seenSubscribers.add(subscriber)
  if (isComputedRef(subscriber)) found.add(subscriber)

  const seenLinks = new Set<object>()
  for (
    let link = readUnknownProperty(subscriber, 'deps');
    link && typeof link === 'object' && !seenLinks.has(link);
    link = readUnknownProperty(link, 'nextDep')
  ) {
    seenLinks.add(link)
    const dep = readObject(link, 'dep')
    const computed = dep ? readUnknownProperty(dep, 'computed') : undefined
    if (isComputedRef(computed)) found.add(computed)
  }
}

function readComputedGetter(value: object): { name: string; toString(): string } | undefined {
  const fn = readUnknownProperty(value, 'fn')
  if (typeof fn === 'function') return fn

  const effect = readObject(value, 'effect')
  const effectFn = effect
    ? (readUnknownProperty(effect, 'fn') ?? readUnknownProperty(effect, 'raw'))
    : undefined
  return typeof effectFn === 'function' ? effectFn : undefined
}

// Vue 3.5 EffectFlags.DIRTY / EVALUATED. Used so refreshComputed re-runs when
// tracked deps did not change (reactivity-loss debugging).
const COMPUTED_DIRTY_FLAG = 16

const COMPUTED_EVALUATED_FLAG = 128

export function triggerComputedRef(computedRef: object): void {
  const record = computedRef as Record<string, unknown>
  if (typeof record.flags === 'number') {
    record.flags = (record.flags | COMPUTED_DIRTY_FLAG) & ~COMPUTED_EVALUATED_FLAG
    if (typeof record.globalVersion === 'number') record.globalVersion -= 1
  }

  const effect = record.effect
  if (effect && typeof effect === 'object' && effect !== computedRef)
    (effect as { dirty?: boolean }).dirty = true

  // Vue 3.5 `triggerRef(ref)` is `ref.dep.trigger(...)` on the page's Vue.
  const dep = record.dep
  if (dep && typeof dep === 'object') {
    const trigger = readUnknownProperty(dep, 'trigger')
    if (typeof trigger === 'function') {
      trigger.call(dep, {
        target: computedRef,
        type: 'set',
        key: 'value',
        newValue: record._value,
      })
    }
  }

  void record.value
  // Vue only restores EVALUATED when the result changes. A successful forced
  // read still counts as accessed when it returns the same value.
  if (typeof record.flags === 'number') record.flags |= COMPUTED_EVALUATED_FLAG
}

export function readComputedSource(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object') return

  const effect = readObject(value, 'effect')
  const source = effect
    ? (readUnknownProperty(effect, 'raw') ?? readUnknownProperty(effect, 'fn'))
    : readUnknownProperty(value, 'fn')
  return typeof source === 'function' ? source.toString() : undefined
}

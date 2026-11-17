import { expect, it } from 'vitest'
import { createDevtoolsGlobalHook } from '../../../packages/kit/src/hook/install'
import type {
  RuntimeDomainEventType,
  RuntimeEventHandler,
} from '../../../packages/kit/src/runtime/types'
import { createRuntimeEventLog } from '../../../packages/kit/src/runtime/events'

it('matches forEach hook dispatch with live mutation, recursion, once and exceptions', () => {
  function exercise(legacy: boolean) {
    const hook = createDevtoolsGlobalHook()
    if (legacy)
      hook.emit = function (event, ...payload) {
        this.events.get(event)?.forEach((handler) => handler(...payload))
      }
    const calls: unknown[] = []
    let nested = false
    const removed = () => calls.push('removed')
    const added = (...args: unknown[]) => calls.push(['added', ...args])
    hook.on('test', (...args: unknown[]) => {
      calls.push(['first', ...args])
      hook.off('test', removed)
      hook.on('test', added)
      if (!nested) {
        nested = true
        hook.emit('test', 'nested')
      }
    })
    hook.on('test', removed)
    hook.once('test', (...args: unknown[]) => calls.push(['once', ...args]))
    hook.emit('test', 'outer', 42)
    hook.emit('test', 'next')
    hook.on('error', () => {
      calls.push('throw')
      throw new Error('stop')
    })
    hook.on('error', () => calls.push('unreachable'))
    expect(() => hook.emit('error')).toThrow('stop')
    return calls
  }
  expect(exercise(false)).toEqual(exercise(true))
})

it('matches live forEach runtime dispatch including wildcard lookup after typed callbacks', () => {
  function exercise(legacy: boolean) {
    const log = createRuntimeEventLog()
    const listeners = new Map<string, Set<RuntimeEventHandler>>()
    if (legacy) {
      log.dispatch = (event) => {
        listeners.get(event.type)?.forEach((handler) => handler(event))
        listeners.get('*')?.forEach((handler) => handler(event))
      }
      log.subscribe = (type: RuntimeDomainEventType | '*', handler: RuntimeEventHandler) => {
        const handlers = listeners.get(type) ?? new Set<RuntimeEventHandler>()
        handlers.add(handler)
        listeners.set(type, handlers)
        return () => {
          handlers.delete(handler)
          if (handlers.size === 0) listeners.delete(type)
        }
      }
      log.clear = () => listeners.clear()
    }
    const calls: string[] = []
    const event = {
      type: 'timeline:eventsLimited' as const,
      time: 1,
      layerId: 'test',
      dropped: 1,
      coalesced: 0,
    }
    let nested = false
    let remove = () => {}
    log.subscribe(event.type, () => {
      calls.push('first')
      remove()
      log.subscribe(event.type, () => calls.push('added'))
      if (!nested) {
        nested = true
        log.dispatch(event)
        log.clear()
        log.subscribe('*', () => calls.push('new wildcard'))
      }
    })
    remove = log.subscribe(event.type, () => calls.push('removed'))
    log.subscribe('*', () => calls.push('old wildcard'))
    log.dispatch(event)
    log.dispatch(event)
    log.subscribe(event.type, () => {
      calls.push('throw')
      throw new Error('stop')
    })
    expect(() => log.dispatch(event)).toThrow('stop')
    return calls
  }
  expect(exercise(false)).toEqual(exercise(true))
})

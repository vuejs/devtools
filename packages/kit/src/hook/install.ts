import type { DevtoolsRuntime } from '../runtime'
import type { DevtoolsGlobalHook, DevtoolsHookableBridge, DevtoolsHookTarget } from './types'
import { normalizeHookEvent } from './normalize'

export interface InstallDevtoolsHookOptions {
  runtime: DevtoolsRuntime
  target?: DevtoolsHookTarget
  replay?: boolean
}

export interface InstalledDevtoolsHook {
  hook: DevtoolsGlobalHook
  dispose(): void
}

const DEFAULT_TARGET = globalThis as DevtoolsHookTarget

export function createDevtoolsGlobalHook(): DevtoolsGlobalHook {
  return {
    id: 'vue-devtools-next',
    devtoolsVersion: '7.0',
    enabled: true,
    apps: [],
    events: new Map(),
    cleanupBuffer() {
      // This hook dispatches immediately and has no component event buffer.
      // Returning false tells Vue to emit the component:removed notification.
      return false
    },
    on(event, handler) {
      const handlers = this.events.get(event) ?? new Set<Function>()
      handlers.add(handler)
      this.events.set(event, handlers)
      return () => this.off(event, handler)
    },
    once(event, handler) {
      const onceHandler = (...args: unknown[]) => {
        this.off(event, onceHandler)
        handler(...args)
      }
      this.on(event, onceHandler)
    },
    off(event, handler) {
      this.events.get(event)?.delete(handler)
    },
    emit(event, ...payload) {
      this.events.get(event)?.forEach((handler) => handler(...payload))
    },
  }
}

export function installDevtoolsHook(options: InstallDevtoolsHookOptions): InstalledDevtoolsHook {
  const target = options.target ?? DEFAULT_TARGET
  const hook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__ ?? createDevtoolsGlobalHook()
  const hookableBridge =
    target.__VUE_DEVTOOLS_HOOK ?? target.__VUE_DEVTOOLS_HOOK__ ?? createDevtoolsHookableBridge()
  const disposers: Array<() => void> = []

  const eventNames = [
    'app:init',
    'app:unmount',
    'component:added',
    'component:updated',
    'component:removed',
    'component:emit',
    'perf:start',
    'perf:end',
    'devtools-plugin:setup',
  ]

  for (const eventName of eventNames) {
    disposers.push(
      hook.on(eventName, (...payload: unknown[]) => {
        const event = normalizeHookEvent(options.runtime.registry, eventName, payload)
        if (event) options.runtime.dispatch(event)
      }),
    )
  }

  disposers.push(
    hookableBridge.hook('devtools-plugin:setup', (descriptor: unknown, setup: unknown) => {
      const event = normalizeHookEvent(options.runtime.registry, 'devtools-plugin:setup', [
        descriptor,
        setup,
      ])
      if (event) options.runtime.dispatch(event)
    }),
  )

  if (!target.__VUE_DEVTOOLS_GLOBAL_HOOK__) target.__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook
  if (!target.__VUE_DEVTOOLS_HOOK) target.__VUE_DEVTOOLS_HOOK = hookableBridge
  if (!target.__VUE_DEVTOOLS_HOOK__) target.__VUE_DEVTOOLS_HOOK__ = hookableBridge

  if (options.replay ?? true) {
    target.__VUE_DEVTOOLS_HOOK_REPLAY__?.forEach((replay) => replay(hook))
    target.__VUE_DEVTOOLS_HOOK_REPLAY__ = []
  }

  return {
    hook,
    dispose() {
      disposers.forEach((dispose) => dispose())
    },
  }
}

function createDevtoolsHookableBridge(): DevtoolsHookableBridge {
  const handlers = new Map<string, Set<Function>>()

  return {
    hook(event, handler) {
      const eventHandlers = handlers.get(event) ?? new Set<Function>()
      eventHandlers.add(handler)
      handlers.set(event, eventHandlers)

      return () => {
        eventHandlers.delete(handler)
      }
    },
    async callHook(event, ...payload) {
      await Promise.all([...(handlers.get(event) ?? [])].map((handler) => handler(...payload)))
    },
  }
}

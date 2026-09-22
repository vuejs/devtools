export interface RuntimeBudget {
  components: {
    autoTrack: boolean
    maxInitialDepth: number
    maxExpandedDepth: number
    updateDebounceMs: number
  }
  state: {
    maxDepth: number
    maxEntries: number
    maxStringLength: number
    maxHandles: number
    lazyChildren: boolean
  }
  timeline: {
    enabled: boolean
    maxEventsPerSecond: number
    maxBufferedEvents: number
  }
  transport: {
    maxMessageBytes: number
    backpressure: 'drop-oldest' | 'drop-newest' | 'pause-collection'
  }
}

export const defaultRuntimeBudget: RuntimeBudget = {
  components: {
    autoTrack: true,
    maxInitialDepth: 2,
    maxExpandedDepth: 100,
    updateDebounceMs: 120,
  },
  state: {
    maxDepth: 2,
    maxEntries: 100,
    maxStringLength: 10_000,
    maxHandles: 10_000,
    lazyChildren: true,
  },
  timeline: {
    enabled: true,
    maxEventsPerSecond: 500,
    maxBufferedEvents: 5_000,
  },
  transport: {
    maxMessageBytes: 2 * 1024 * 1024,
    backpressure: 'drop-oldest',
  },
}

export type RuntimeBudgetInput = Partial<{
  [K in keyof RuntimeBudget]: Partial<RuntimeBudget[K]>
}>

export function resolveRuntimeBudget(input: RuntimeBudgetInput = {}): RuntimeBudget {
  const components = { ...defaultRuntimeBudget.components, ...input.components }
  const state = { ...defaultRuntimeBudget.state, ...input.state }
  const timeline = { ...defaultRuntimeBudget.timeline, ...input.timeline }
  const transport = { ...defaultRuntimeBudget.transport, ...input.transport }

  return {
    components: {
      autoTrack: components.autoTrack === true,
      maxInitialDepth: clampInteger(components.maxInitialDepth, 0, 100),
      maxExpandedDepth: clampInteger(components.maxExpandedDepth, 1, 1_000),
      updateDebounceMs: clampInteger(components.updateDebounceMs, 0, 10_000),
    },
    state: {
      lazyChildren: state.lazyChildren === true,
      maxDepth: clampInteger(state.maxDepth, 0, 100),
      maxEntries: clampInteger(state.maxEntries, 1, 100_000),
      maxStringLength: clampInteger(state.maxStringLength, 1, 10_000_000),
      maxHandles: clampInteger(state.maxHandles, 100, 1_000_000),
    },
    timeline: {
      enabled: timeline.enabled === true,
      maxBufferedEvents: clampInteger(timeline.maxBufferedEvents, 1, 100_000),
      maxEventsPerSecond: clampInteger(timeline.maxEventsPerSecond, 1, 100_000),
    },
    transport: {
      backpressure: isBackpressureStrategy(transport.backpressure)
        ? transport.backpressure
        : defaultRuntimeBudget.transport.backpressure,
      maxMessageBytes: clampInteger(transport.maxMessageBytes, 1_024, 100 * 1024 * 1024),
    },
  }
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function isBackpressureStrategy(
  value: string,
): value is RuntimeBudget['transport']['backpressure'] {
  return value === 'drop-oldest' || value === 'drop-newest' || value === 'pause-collection'
}

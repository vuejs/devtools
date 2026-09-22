import type { ValueHandleRegistry } from '../../codec'
import type { DevtoolsRuntime } from '../runtime'
import type { RuntimeTimelineController } from '../timeline'
import type { AppRef } from '../types'
import {
  readBoolean,
  readNumber,
  readObject,
  readString,
  readStringArray,
  readUnknownProperty,
  resolveAppRef,
  retiredAppError,
} from './shared'

export function registerTimelineHandlers(
  runtime: DevtoolsRuntime,
  timelineValueHandles: ValueHandleRegistry,
  timeline: RuntimeTimelineController,
) {
  runtime.registerCommand('timeline:setRecording', (command) => {
    const recording = readBoolean(command.payload, 'recording')
    const disabledLayerIds = readStringArray(command.payload, 'disabledLayerIds')

    if (recording != null) timeline.setRecording(recording)
    timeline.setDisabledLayerIds(disabledLayerIds)
    return { status: 1 }
  })

  runtime.registerCommand('timeline:clear', async () => {
    await runtime.callPluginHook('timelineCleared', {})
    return { status: 1 }
  })

  runtime.registerCommand('timeline:inspectEvent', async (command) => {
    const pluginId = readString(command.payload, 'pluginId')
    const event = readObject(command.payload, 'event')
    if (!pluginId || !event) return { status: 0, error: 'Invalid Timeline event inspection' }

    await runtime.callPluginHook(
      'inspectTimelineEvent',
      {
        app: resolveAppRef(runtime, command.appId),
        appId: command.appId,
        pluginId,
        layerId: readString(command.payload, 'layerId') ?? '',
        event,
        all: readBoolean(event, 'all'),
        data: readUnknownProperty(event, 'data'),
      },
      pluginId,
    )
    return { status: 1 }
  })

  runtime.registerCommand('timeline:addLayer', (command) => {
    const payload = command.payload
    const options = readObject(payload, 'options')
    const layerId = readString(options, 'id')
    if (!layerId) return { status: 0, error: 'Invalid timeline layer' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(layerId) }
    if (!timeline.claimLayer(layerId, readString(payload, 'pluginId') ?? 'anonymous'))
      return { status: 0, error: layerOwnershipError(layerId) }
    runtime.events.dispatch({
      type: 'timeline:layerAdded',
      time: Date.now(),
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      pluginId: readString(payload, 'pluginId'),
      layerId,
      label: readString(options, 'label'),
      color: readNumber(options, 'color'),
    })
    return { status: 1 }
  })

  runtime.registerCommand('timeline:addEvent', (command) => {
    const payload = command.payload
    const options = readObject(payload, 'options')
    const event = readObject(options, 'event')
    const layerId = readString(options, 'layerId')
    const title = readString(event, 'title')
    if (!layerId || !title) return { status: 0, error: 'Invalid timeline event' }

    const app = readObject(payload, 'app') as AppRef | undefined
    if (app && runtime.registry.isAppRetired(app))
      return { status: 0, error: retiredAppError(layerId) }
    const layerOwner = timeline.getLayerOwner(layerId)
    if (layerOwner != null && layerOwner !== (readString(payload, 'pluginId') ?? 'anonymous'))
      return { status: 0, error: layerOwnershipError(layerId) }
    if (!timeline.shouldRecord(layerId)) return { status: 1 }
    const time = normalizeTimelineTime(readNumber(event, 'time') ?? Date.now())
    const data = readUnknownProperty(event, 'data')
    const meta = readUnknownProperty(event, 'meta')
    timeline.addEvent({
      time,
      appId: app ? runtime.registry.getAppByRef(app)?.id : undefined,
      pluginId: readString(payload, 'pluginId'),
      layerId,
      title,
      subtitle: readString(event, 'subtitle'),
      data,
      meta,
      groupId: readNumber(event, 'groupId'),
      logType: readTimelineLogType(event),
      all: readBoolean(options, 'all'),
    })
    return { status: 1 }
  })
}

const timelineInitialTime = Date.now()

const timelineDateThreshold = timelineInitialTime - 1_000_000

const timelinePerfTimeDiff = timelineInitialTime - getPerformanceNow()

function layerOwnershipError(layerId: string): string {
  return `Timeline layer "${layerId}" is already owned by another plugin`
}

function getPerformanceNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function normalizeTimelineTime(time: number): number {
  if (typeof performance !== 'undefined' && time < timelineDateThreshold)
    return Math.round(time + timelinePerfTimeDiff)
  return Math.round(time)
}

function readTimelineLogType(target: unknown): 'default' | 'warning' | 'error' | undefined {
  const value = readString(target, 'logType')
  return value === 'default' || value === 'warning' || value === 'error' ? value : undefined
}

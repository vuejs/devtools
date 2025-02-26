import type { DevToolsV6PluginAPI } from '../../api/v6'
import { isBrowser } from '@vue/devtools-shared'
import { getAppRecord, getInstanceName } from '../../core/component/utils'
import { devtoolsState } from '../../ctx/state'
import { hook } from '../../hook'
import { PERFORMANCE_EVENT_LAYER_ID, performanceMarkEnd, performanceMarkStart } from './perf'

const COMPONENT_EVENT_LAYER_ID = 'component-event'

export function setupBuiltinTimelineLayers(api: DevToolsV6PluginAPI) {
  if (!isBrowser)
    return

  // Mouse events timeline layer

  api.addTimelineLayer({
    id: 'mouse',
    label: 'Mouse',
    color: 0xA451AF,
  })

  ;(['mousedown', 'mouseup', 'click', 'dblclick'] as const).forEach((eventType) => {
    if (!devtoolsState.timelineLayersState.recordingState || !devtoolsState.timelineLayersState.mouseEventEnabled)
      return
    window.addEventListener(eventType, async (event: MouseEvent) => {
      await api.addTimelineEvent({
        layerId: 'mouse',
        event: {
          time: Date.now(),
          data: {
            type: eventType,
            x: event.clientX,
            y: event.clientY,
          },
          title: eventType,
        },
      })
    }, {
      capture: true,
      passive: true,
    })
  })

  // Keyboard events timeline layer

  api.addTimelineLayer({
    id: 'keyboard',
    label: 'Keyboard',
    color: 0x8151AF,
  })

  ;(['keyup', 'keydown', 'keypress'] as const).forEach((eventType) => {
    window.addEventListener(eventType, async (event: KeyboardEvent) => {
      if (!devtoolsState.timelineLayersState.recordingState || !devtoolsState.timelineLayersState.keyboardEventEnabled)
        return
      await api.addTimelineEvent({
        layerId: 'keyboard',
        event: {
          time: Date.now(),
          data: {
            type: eventType,
            key: event.key,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          },
          title: event.key,
        },
      })
    }, {
      capture: true,
      passive: true,
    })
  })

  // Component events timeline layer

  api.addTimelineLayer({
    id: COMPONENT_EVENT_LAYER_ID,
    label: 'Component events',
    color: 0x4FC08D,
  })

  hook.on.componentEmit(async (app, instance, event, params) => {
    if (!devtoolsState.timelineLayersState.recordingState || !devtoolsState.timelineLayersState.componentEventEnabled)
      return

    const appRecord = await getAppRecord(app)

    if (!appRecord)
      return

    const componentId = `${appRecord.id}:${instance.uid}`
    const componentName = getInstanceName(instance) || 'Unknown Component'

    api.addTimelineEvent({
      layerId: COMPONENT_EVENT_LAYER_ID,
      event: {
        time: Date.now(),
        data: {
          component: {
            _custom: {
              type: 'component-definition',
              display: componentName,
            },
          },
          event,
          params,
        },
        title: event,
        subtitle: `by ${componentName}`,
        meta: {
          componentId,
        },
      },
    })
  })

  // Performance timeline layer

  api.addTimelineLayer({
    id: 'performance',
    label: PERFORMANCE_EVENT_LAYER_ID,
    color: 0x41B86A,
  })

  hook.on.perfStart((app, uid, vm, type, time) => {
    if (!devtoolsState.timelineLayersState.recordingState || !devtoolsState.timelineLayersState.performanceEventEnabled)
      return
    performanceMarkStart(api, app, uid, vm, type, time)
  })

  hook.on.perfEnd((app, uid, vm, type, time) => {
    if (!devtoolsState.timelineLayersState.recordingState || !devtoolsState.timelineLayersState.performanceEventEnabled)
      return
    performanceMarkEnd(api, app, uid, vm, type, time)
  })
}

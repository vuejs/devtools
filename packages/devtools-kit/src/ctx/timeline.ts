import type { PluginDescriptor, TimelineLayerOptions } from '../types'
import { target } from '@vue/devtools-shared'
import { getAppRecord } from '../core/component/utils'
import { addTimelineLayersStateToStorage } from '../core/timeline/storage'
import { devtoolsState, updateDevToolsState } from './state'

interface DevToolsKitTimelineLayer extends TimelineLayerOptions {
  appRecord: unknown
  descriptorId: string
}

target.__VUE_DEVTOOLS_KIT_TIMELINE_LAYERS ??= []

export const devtoolsTimelineLayers = new Proxy<DevToolsKitTimelineLayer[]>(target.__VUE_DEVTOOLS_KIT_TIMELINE_LAYERS, {
  get(target, prop, receiver) {
    return Reflect.get(target, prop, receiver)
  },
})

export function addTimelineLayer(options: TimelineLayerOptions, descriptor: PluginDescriptor) {
  devtoolsState.timelineLayersState[descriptor.id] = false
  devtoolsTimelineLayers.push({
    ...options,
    descriptorId: descriptor.id,
    appRecord: getAppRecord(descriptor.app),
  })
}

export function updateTimelineLayersState(state: Record<string, boolean>) {
  const updatedState = {
    ...devtoolsState.timelineLayersState,
    ...state,
  }
  addTimelineLayersStateToStorage(updatedState)
  updateDevToolsState({
    timelineLayersState: updatedState,
  })
}

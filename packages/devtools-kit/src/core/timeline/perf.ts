import type { App } from 'vue'
import type { DevToolsV6PluginAPI } from '../../api/v6'
import type { VueAppInstance } from '../../types'
import { getAppRecord, getInstanceName } from '../../core/component/utils'
import { devtoolsState } from '../../ctx/state'

type HookAppInstance = App & VueAppInstance
const markEndQueue = new Map<string, {
  app: App
  uid: number
  instance: HookAppInstance
  type: string
  time: number
}>()
export const PERFORMANCE_EVENT_LAYER_ID = 'performance'

export async function performanceMarkStart(api: DevToolsV6PluginAPI, app: App, uid: number, vm: HookAppInstance, type: string, time: number) {
  const appRecord = await getAppRecord(app)
  if (!appRecord) {
    return
  }
  const componentName = getInstanceName(vm) || 'Unknown Component'
  const groupId = devtoolsState.perfUniqueGroupId++
  const groupKey = `${uid}-${type}`
  appRecord.perfGroupIds.set(groupKey, { groupId, time })
  await api.addTimelineEvent({
    layerId: PERFORMANCE_EVENT_LAYER_ID,
    event: {
      time: Date.now(),
      data: {
        component: componentName,
        type,
        measure: 'start',
      },
      title: componentName,
      subtitle: type,
      groupId,
    },
  })
  if (markEndQueue.has(groupKey)) {
    const {
      app,
      uid,
      instance,
      type,
      time,
    } = markEndQueue.get(groupKey)!
    markEndQueue.delete(groupKey)
    await performanceMarkEnd(
      api,
      app,
      uid,
      instance,
      type,
      time,
    )
  }
}

export function performanceMarkEnd(api: DevToolsV6PluginAPI, app: App, uid: number, vm: HookAppInstance, type: string, time: number) {
  const appRecord = getAppRecord(app)
  if (!appRecord)
    return

  const componentName = getInstanceName(vm) || 'Unknown Component'
  const groupKey = `${uid}-${type}`
  const groupInfo = appRecord.perfGroupIds.get(groupKey)
  if (groupInfo) {
    const groupId = groupInfo.groupId
    const startTime = groupInfo.time
    const duration = time - startTime
    api.addTimelineEvent({
      layerId: PERFORMANCE_EVENT_LAYER_ID,
      event: {
        time: Date.now(),
        data: {
          component: componentName,
          type,
          measure: 'end',
          duration: {
            _custom: {
              type: 'Duration',
              value: duration,
              display: `${duration} ms`,
            },
          },
        },
        title: componentName,
        subtitle: type,
        groupId,
      },
    })
  }
  else {
    markEndQueue.set(groupKey, { app, uid, instance: vm, type, time })
  }
}

import { target } from '@vue/devtools-shared'
import slug from 'speakingurl'
import { AppRecord, VueAppInstance } from '../../types'

const appRecordInfo = target.__VUE_DEVTOOLS_NEXT_APP_RECORD_INFO__ ??= {
  id: 0,
  appIds: new Set<string>(),
}

function getAppRecordName(app: VueAppInstance['appContext']['app'], fallbackName: string) {
  return app?._component?.name || `App ${fallbackName}`
}

function getAppRootInstance(app: VueAppInstance['appContext']['app']) {
  if (app._instance)
    return app._instance

  else if (app._container?._vnode?.component)
    return app._container?._vnode?.component
}

export function removeAppRecordId(app: VueAppInstance['appContext']['app']) {
  const id = app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__
  if (id != null) {
    appRecordInfo.appIds.delete(id)
    appRecordInfo.id--
  }
}

function getAppRecordId(app: VueAppInstance['appContext']['app'], defaultId?: string): string {
  if (app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__ != null)
    return app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__

  let id = defaultId ?? (appRecordInfo.id++).toString()

  if (defaultId && appRecordInfo.appIds.has(id)) {
    let count = 1
    while (appRecordInfo.appIds.has(`${defaultId}_${count}`))
      count++
    id = `${defaultId}_${count}`
  }

  appRecordInfo.appIds.add(id)

  app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__ = id
  return id
}

export function createAppRecord(app: VueAppInstance['appContext']['app'], types: Record<string, string | symbol>): AppRecord {
  const rootInstance = getAppRootInstance(app)
  if (rootInstance) {
    appRecordInfo.id++
    const name = getAppRecordName(app, appRecordInfo.id.toString())
    const id = getAppRecordId(app, slug(name))

    const record: AppRecord = {
      id,
      name,
      types,
      instanceMap: new Map(),
      perfGroupIds: new Map(),
      rootInstance,
    }

    app.__VUE_DEVTOOLS_NEXT_APP_RECORD__ = record
    const rootId = `${record.id}:root`
    record.instanceMap.set(rootId, record.rootInstance)
    record.rootInstance.__VUE_DEVTOOLS_NEXT_UID__ = rootId

    return record
  }
  else {
    return {} as AppRecord
  }
}

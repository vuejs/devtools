import { target } from '@vue-devtools-next/shared'
import { DevToolsEvents, DevToolsPluginApi, apiHooks, collectRegisteredPlugin, registerPlugin } from '../../api'
import { initComponentTree } from '../component/tree'
import { createAppRecord } from './app'
import { createDevToolsHook, hook, subscribeDevToolsHook } from './hook'
import { devtoolsContext, devtoolsState } from './state'

// usage: inject to user application and call it before the vue app is created
export function initDevTools() {
  // override directly to prevent conflict with the old devtools
  target.__VUE_DEVTOOLS_GLOBAL_HOOK__ = createDevToolsHook()

  target.__VUE_DEVTOOLS_APP_RECORDS__ ??= []

  // create app record
  hook.on.vueAppInit((app, version) => {
    const record = createAppRecord(app)
    const api = new DevToolsPluginApi()
    devtoolsState.appRecords = [
      ...(devtoolsState.appRecords ?? []),
      {
        ...record,
        app,
        version,
        api,
      },
    ]

    if (devtoolsState.appRecords.length === 1) {
      // set first app as default record
      devtoolsState.activeAppRecord = devtoolsState.appRecords[0]
      devtoolsState.connected = true
      // mark vue app as connected
      apiHooks.callHook(DevToolsEvents.APP_CONNECTED)
    }
    registerPlugin({
      app,
      api,
    })
  })

  // devtools plugin setup hook
  hook.on.setupDevtoolsPlugin(collectRegisteredPlugin)

  initComponentTree()

  subscribeDevToolsHook()
}

export function onDevToolsConnected(fn: () => void) {
  return new Promise<void>((resolve) => {
    if (devtoolsState.connected) {
      fn()
      resolve()
      return
    }

    devtoolsContext.api.on.vueAppConnected(() => {
      fn()
      resolve()
    })
  })
}

export {
  devtoolsContext,
  devtoolsState,
  hook,
}

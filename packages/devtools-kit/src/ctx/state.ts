import type { AppRecord, CustomCommand, CustomTab } from '../types'
import { target as global, isUrlString } from '@vue/devtools-shared'
import { debounce } from 'perfect-debounce'
import { devtoolsContext } from '.'
import { getTimelineLayersStateFromStorage } from '../core/timeline/storage'
import { DevToolsMessagingHookKeys } from './hook'

export interface DevToolsAppRecords extends AppRecord {}

export interface DevToolsState {
  connected: boolean
  clientConnected: boolean
  vitePluginDetected: boolean
  appRecords: DevToolsAppRecords[]
  activeAppRecordId: string
  tabs: CustomTab[]
  commands: CustomCommand[]
  highPerfModeEnabled: boolean
  devtoolsClientDetected: {
    [key: string]: boolean
  }
  perfUniqueGroupId: number
  timelineLayersState: Record<string, boolean>
}

global.__VUE_DEVTOOLS_KIT_APP_RECORDS__ ??= []
global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD__ ??= {}
global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD_ID__ ??= ''
global.__VUE_DEVTOOLS_KIT_CUSTOM_TABS__ ??= []
global.__VUE_DEVTOOLS_KIT_CUSTOM_COMMANDS__ ??= []

const STATE_KEY = '__VUE_DEVTOOLS_KIT_GLOBAL_STATE__'
function initStateFactory() {
  return {
    connected: false,
    clientConnected: false,
    vitePluginDetected: true,
    appRecords: [],
    activeAppRecordId: '',
    tabs: [],
    commands: [],
    highPerfModeEnabled: true,
    devtoolsClientDetected: {},
    perfUniqueGroupId: 0,
    timelineLayersState: getTimelineLayersStateFromStorage(),
  }
}
global[STATE_KEY] ??= initStateFactory()

export const callStateUpdatedHook = debounce((state: DevToolsState) => {
  devtoolsContext.hooks.callHook(DevToolsMessagingHookKeys.DEVTOOLS_STATE_UPDATED, { state })
})

export const callConnectedUpdatedHook = debounce((state: DevToolsState, oldState: DevToolsState) => {
  devtoolsContext.hooks.callHook(DevToolsMessagingHookKeys.DEVTOOLS_CONNECTED_UPDATED, { state, oldState })
})

export const devtoolsAppRecords = new Proxy<DevToolsAppRecords[] & { value: DevToolsAppRecords[] }>(global.__VUE_DEVTOOLS_KIT_APP_RECORDS__, {
  get(_target, prop, receiver) {
    if (prop === 'value')
      return global.__VUE_DEVTOOLS_KIT_APP_RECORDS__

    return global.__VUE_DEVTOOLS_KIT_APP_RECORDS__[prop]
  },
})

export const addDevToolsAppRecord = (app: AppRecord) => {
  global.__VUE_DEVTOOLS_KIT_APP_RECORDS__ = [
    ...global.__VUE_DEVTOOLS_KIT_APP_RECORDS__,
    app,
  ]
}

export const removeDevToolsAppRecord = (app: AppRecord['app']) => {
  global.__VUE_DEVTOOLS_KIT_APP_RECORDS__ = devtoolsAppRecords.value.filter(record => record.app !== app)
}

export const activeAppRecord = new Proxy<AppRecord & { value: AppRecord, id: string }>(global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD__, {
  get(_target, prop, receiver) {
    if (prop === 'value')
      return global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD__

    else if (prop === 'id')
      return global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD_ID__

    return global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD__[prop]
  },
})

// @TODO: refactor
function updateAllStates() {
  callStateUpdatedHook({
    ...global[STATE_KEY],
    appRecords: devtoolsAppRecords.value,
    activeAppRecordId: activeAppRecord.id,
    tabs: global.__VUE_DEVTOOLS_KIT_CUSTOM_TABS__,
    commands: global.__VUE_DEVTOOLS_KIT_CUSTOM_COMMANDS__,
  })
}

export function setActiveAppRecord(app: AppRecord) {
  global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD__ = app
  updateAllStates()
}

export function setActiveAppRecordId(id: string) {
  global.__VUE_DEVTOOLS_KIT_ACTIVE_APP_RECORD_ID__ = id
  updateAllStates()
}

export const devtoolsState: DevToolsState = new Proxy(global[STATE_KEY], {
  get(target, property) {
    if (property === 'appRecords') {
      return devtoolsAppRecords
    }
    else if (property === 'activeAppRecordId') {
      return activeAppRecord.id
    }
    else if (property === 'tabs') {
      return global.__VUE_DEVTOOLS_KIT_CUSTOM_TABS__
    }
    else if (property === 'commands') {
      return global.__VUE_DEVTOOLS_KIT_CUSTOM_COMMANDS__
    }
    return global[STATE_KEY][property]
  },
  deleteProperty(target, property) {
    delete target[property]
    return true
  },
  set(target, property, value) {
    const oldState = { ...global[STATE_KEY] }

    target[property] = value
    global[STATE_KEY][property] = value

    return true
  },
})

export function resetDevToolsState() {
  Object.assign(global[STATE_KEY], initStateFactory())
}

export function updateDevToolsState(state: Partial<DevToolsState>) {
  const oldState = {
    ...global[STATE_KEY],
    appRecords: devtoolsAppRecords.value,
    activeAppRecordId: activeAppRecord.id,
  }
  if (
    (oldState.connected !== state.connected && state.connected)
    || (oldState.clientConnected !== state.clientConnected && state.clientConnected)
  ) {
    callConnectedUpdatedHook(global[STATE_KEY], oldState)
  }
  Object.assign(global[STATE_KEY], state)
  updateAllStates()
}

export function onDevToolsConnected(fn: () => void) {
  return new Promise<void>((resolve) => {
    if (devtoolsState.connected) {
      fn()
      resolve()
    }

    devtoolsContext.hooks.hook(DevToolsMessagingHookKeys.DEVTOOLS_CONNECTED_UPDATED, ({ state }) => {
      if (state.connected) {
        fn()
        resolve()
      }
    })
  })
}

const resolveIcon = (icon?: string) => {
  if (!icon)
    return
  if (icon.startsWith('baseline-')) {
    return `custom-ic-${icon}`
  }
  // devtools internal custom tab icons are starts with `i-` prefix, render as it is set in unocss safelist
  // or if it's a url
  if (icon.startsWith('i-') || isUrlString(icon))
    return icon
  // for custom-tab, we use `custom-ic-` prefix
  return `custom-ic-baseline-${icon}`
}

export function addCustomTab(tab: CustomTab) {
  const tabs = global.__VUE_DEVTOOLS_KIT_CUSTOM_TABS__
  if (tabs.some((t: CustomTab) => t.name === tab.name))
    return

  tabs.push({
    ...tab,
    icon: resolveIcon(tab.icon),
  })
  updateAllStates()
}

export function addCustomCommand(action: CustomCommand) {
  const commands = global.__VUE_DEVTOOLS_KIT_CUSTOM_COMMANDS__
  if (commands.some((t: CustomCommand) => t.id === action.id))
    return

  commands.push({
    ...action,
    icon: resolveIcon(action.icon),
    children: action.children
      ? action.children.map((child: CustomCommand) => ({
          ...child,
          icon: resolveIcon(child.icon),
        }))
      : undefined,
  })
  updateAllStates()
}

export function removeCustomCommand(actionId: string) {
  const commands = global.__VUE_DEVTOOLS_KIT_CUSTOM_COMMANDS__

  const index = commands.findIndex(t => t.id === actionId)
  if (index === -1)
    return

  commands.splice(index, 1)
  updateAllStates()
}

export function toggleClientConnected(state: boolean) {
  updateDevToolsState({ clientConnected: state })
}

import { activeAppRecord, devtoolsState } from '../../ctx/state'
import { registerDevToolsPlugin } from '../plugin'

export function toggleHighPerfMode(state?: boolean) {
  devtoolsState.highPerfModeEnabled = state ?? !devtoolsState.highPerfModeEnabled
  if (!state && activeAppRecord.value) {
    registerDevToolsPlugin(activeAppRecord.value.app)
  }
}

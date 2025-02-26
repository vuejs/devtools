import { target } from '@vue/devtools-shared'
import { devtoolsState } from '../../ctx/state'
import { toggleHighPerfMode } from '../high-perf-mode'

export function updateDevToolsClientDetected(params: Record<string, boolean>) {
  devtoolsState.devtoolsClientDetected = {
    ...devtoolsState.devtoolsClientDetected,
    ...params,
  }
  const devtoolsClientVisible = Object.values(devtoolsState.devtoolsClientDetected).some(Boolean)
  toggleHighPerfMode(!devtoolsClientVisible)
}

target.__VUE_DEVTOOLS_UPDATE_CLIENT_DETECTED__ ??= updateDevToolsClientDetected

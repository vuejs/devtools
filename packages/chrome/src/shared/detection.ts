export const VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE = 'vue-devtools:chrome'
export const VUE_DEVTOOLS_DETECTION_EVENT = 'vue-devtools:detection'
export const VUE_DEVTOOLS_DETECTION_QUERY = 'vue-devtools:detection-query'

export interface VueDevtoolsDetectionPayload {
  appCount: number
  devtoolsEnabled: boolean
  installed: boolean
  nuxtDetected: boolean
  vitePluginClientUrl?: string
  vitePluginDetected: boolean
  vitePressDetected: boolean
  vueDetected: boolean
}

export interface VueDevtoolsDetectionMessage {
  source: typeof VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE
  type: typeof VUE_DEVTOOLS_DETECTION_EVENT
  payload: VueDevtoolsDetectionPayload
}

export function createVueDevtoolsDetectionMessage(
  payload: VueDevtoolsDetectionPayload,
): VueDevtoolsDetectionMessage {
  return {
    payload,
    source: VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE,
    type: VUE_DEVTOOLS_DETECTION_EVENT,
  }
}

export interface VueDevtoolsDetectionQueryMessage {
  source: typeof VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE
  type: typeof VUE_DEVTOOLS_DETECTION_QUERY
  tabId: number
}

export function createVueDevtoolsDetectionQueryMessage(
  tabId: number,
): VueDevtoolsDetectionQueryMessage {
  return {
    source: VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE,
    tabId,
    type: VUE_DEVTOOLS_DETECTION_QUERY,
  }
}

export function isVueDevtoolsDetectionQueryMessage(
  value: unknown,
): value is VueDevtoolsDetectionQueryMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<VueDevtoolsDetectionQueryMessage>
  return (
    message.source === VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE &&
    message.type === VUE_DEVTOOLS_DETECTION_QUERY &&
    typeof message.tabId === 'number'
  )
}

export function isVueDevtoolsDetectionMessage(
  value: unknown,
): value is VueDevtoolsDetectionMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<VueDevtoolsDetectionMessage>
  return (
    message.source === VUE_DEVTOOLS_EXTENSION_MESSAGE_SOURCE &&
    message.type === VUE_DEVTOOLS_DETECTION_EVENT &&
    isVueDevtoolsDetectionPayload(message.payload)
  )
}

function isVueDevtoolsDetectionPayload(value: unknown): value is VueDevtoolsDetectionPayload {
  if (!value || typeof value !== 'object') return false

  const payload = value as Partial<VueDevtoolsDetectionPayload>
  return (
    typeof payload.appCount === 'number' &&
    typeof payload.devtoolsEnabled === 'boolean' &&
    typeof payload.installed === 'boolean' &&
    typeof payload.nuxtDetected === 'boolean' &&
    typeof payload.vitePluginDetected === 'boolean' &&
    typeof payload.vitePressDetected === 'boolean' &&
    typeof payload.vueDetected === 'boolean' &&
    (payload.vitePluginClientUrl == null || typeof payload.vitePluginClientUrl === 'string')
  )
}

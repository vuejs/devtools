import type { VueDevtoolsDetectionPayload } from '../shared/detection'

const tabDetectionStates = new Map<number, Map<number, VueDevtoolsDetectionPayload>>()

export function updateTabDetectionState(
  tabId: number,
  frameId: number,
  payload: VueDevtoolsDetectionPayload,
): void {
  const frames = tabDetectionStates.get(tabId) ?? new Map<number, VueDevtoolsDetectionPayload>()
  tabDetectionStates.set(tabId, frames)
  frames.set(frameId, payload)

  applyTabDetectionState(tabId, mergeDetectionPayloads([...frames.values()]))
}

export function resetTabDetectionState(tabId: number): void {
  tabDetectionStates.delete(tabId)
  // setIcon/setPopup survive navigation. PDF and XML never re-publish detection,
  // so the previous Vue icon would stay up after the in-memory payload is gone.
  setAction(tabId, {
    gray: true,
    popup: 'not-found.html',
  })
}

export function clearTabDetectionState(tabId: number): void {
  tabDetectionStates.delete(tabId)
}

export function getMergedTabDetectionState(tabId: number): VueDevtoolsDetectionPayload | undefined {
  const frames = tabDetectionStates.get(tabId)
  if (!frames?.size) return
  return mergeDetectionPayloads([...frames.values()])
}

export function mergeDetectionPayloads(
  payloads: VueDevtoolsDetectionPayload[],
): VueDevtoolsDetectionPayload {
  return {
    appCount: payloads.reduce((sum, payload) => sum + payload.appCount, 0),
    devtoolsEnabled: payloads.some((payload) => payload.devtoolsEnabled),
    installed: payloads.some((payload) => payload.installed),
    nuxtDetected: payloads.some((payload) => payload.nuxtDetected),
    vitePluginClientUrl: payloads.find((payload) => payload.vitePluginClientUrl != null)
      ?.vitePluginClientUrl,
    vitePluginDetected: payloads.some((payload) => payload.vitePluginDetected),
    vitePressDetected: payloads.some((payload) => payload.vitePressDetected),
    vueDetected: payloads.some((payload) => payload.vueDetected),
  }
}

function applyTabDetectionState(tabId: number, payload: VueDevtoolsDetectionPayload): void {
  if (!payload.vueDetected) {
    setAction(tabId, {
      gray: true,
      popup: 'not-found.html',
    })
    return
  }

  setAction(tabId, {
    iconSuffix: getIconSuffix(payload),
    popup: `${payload.devtoolsEnabled ? 'enabled' : 'disabled'}${getPopupSuffix(payload)}.html`,
  })
}

function setAction(
  tabId: number,
  options: {
    gray?: boolean
    iconSuffix?: string
    popup: string
  },
): void {
  const suffix = options.gray ? '-gray' : (options.iconSuffix ?? '')

  void chrome.action.setIcon({
    path: {
      16: chrome.runtime.getURL(`icons/16${suffix}.png`),
      48: chrome.runtime.getURL(`icons/48${suffix}.png`),
      128: chrome.runtime.getURL(`icons/128${suffix}.png`),
    },
    tabId,
  })
  void chrome.action.setPopup({
    popup: chrome.runtime.getURL(`app/popups/${options.popup}`),
    tabId,
  })
}

function getIconSuffix(payload: VueDevtoolsDetectionPayload): string {
  if (payload.nuxtDetected) return '.nuxt'
  if (payload.vitePressDetected) return '.vitepress'
  return ''
}

function getPopupSuffix(payload: VueDevtoolsDetectionPayload): string {
  if (payload.nuxtDetected) return '.nuxt'
  if (payload.vitePressDetected) return '.vitepress'
  return ''
}

import type { DevtoolsHookTarget, DevtoolsKit } from '@vue/devtools-kit'
import type { VueDevtoolsDetectionPayload } from '../shared/detection'
import { startExtensionPageRpcHost, createDevtoolsKit } from '@vue/devtools-kit'
import { createVueDevtoolsDetectionMessage } from '../shared/detection'
import { isSupportedDevtoolsDocument } from '../shared/document'
import { CHROME_DEVTOOLS_RPC_CHANNEL_ID } from '../shared/rpc'

interface VueDevtoolsExtensionBackend {
  kit: DevtoolsKit
  dispose(): void
}

interface VueDevtoolsPageTarget extends Window, DevtoolsHookTarget {
  __NUXT__?: unknown
  __VITEPRESS__?: unknown
  __VUE__?: unknown
  __VUE_DEVTOOLS_BROWSER_EXTENSION_DETECTED__?: boolean
  __VUE_DEVTOOLS_EXTENSION_BACKEND__?: VueDevtoolsExtensionBackend
  __VUE_DEVTOOLS_EXTENSION_STATE__?: VueDevtoolsDetectionPayload
  __VUE_DEVTOOLS_VITE_PLUGIN_CLIENT_URL__?: string
  __VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__?: boolean
}

const target = window as VueDevtoolsPageTarget

if (!target.__VUE_DEVTOOLS_EXTENSION_BACKEND__ && isSupportedDevtoolsDocument(target.document))
  installBackend(target)

function installBackend(page: VueDevtoolsPageTarget): void {
  const kit = createDevtoolsKit({
    clientName: 'chrome-extension',
    target: {
      name: 'Chrome Extension',
    },
    hook: {
      target: page,
    },
  })
  const disposers: Array<() => void> = []
  let detectionTimer: number | undefined
  let detectionAttempt = 0
  let detectionDelay = 100

  kit.install()
  page.__VUE_DEVTOOLS_BROWSER_EXTENSION_DETECTED__ = true

  // After a BFCache restore the extension page bridge was torn down by
  // pagehide; republishing detection prompts the background to re-inject it.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) publishDetection(page, kit)
  }
  page.addEventListener('pageshow', onPageShow)

  disposers.push(
    () => page.removeEventListener('pageshow', onPageShow),
    startExtensionPageRpcHost(kit.rpc, {
      allowedOrigins(origin) {
        return origin === page.location.origin
      },
      channelId: CHROME_DEVTOOLS_RPC_CHANNEL_ID,
      window: page,
    }),
    kit.runtime.subscribe('apps:changed', () => {
      detectionAttempt = 0
      detectionDelay = 100
      publishDetection(page, kit)
      scheduleDetection()
    }),
  )

  const backend: VueDevtoolsExtensionBackend = {
    kit,
    dispose() {
      if (detectionTimer != null) page.clearTimeout(detectionTimer)
      disposers.forEach((dispose) => dispose())
      void kit.dispose()
      delete page.__VUE_DEVTOOLS_EXTENSION_BACKEND__
    },
  }

  page.__VUE_DEVTOOLS_EXTENSION_BACKEND__ = backend

  publishDetection(page, kit)
  scheduleDetection()

  function scheduleDetection() {
    if (detectionAttempt >= 10 || detectionTimer != null) return

    detectionTimer = page.setTimeout(() => {
      detectionTimer = undefined
      detectionAttempt += 1
      const payload = publishDetection(page, kit)

      if (!payload.vueDetected) {
        detectionDelay = Math.min(detectionDelay * 2, 5_000)
        scheduleDetection()
      }
    }, detectionDelay)
  }
}

function publishDetection(
  page: VueDevtoolsPageTarget,
  kit: DevtoolsKit,
): VueDevtoolsDetectionPayload {
  const payload = readDetection(page, kit)
  page.__VUE_DEVTOOLS_EXTENSION_STATE__ = payload
  page.postMessage(createVueDevtoolsDetectionMessage(payload), '*')
  return payload
}

function readDetection(page: VueDevtoolsPageTarget, kit: DevtoolsKit): VueDevtoolsDetectionPayload {
  const appCount = kit.runtime.registry.listApps().length
  const nuxtDetected = !!page.__NUXT__
  const vitePressDetected = !!page.__VITEPRESS__
  const vueDetected = appCount > 0 || !!page.__VUE__ || nuxtDetected || vitePressDetected

  return {
    appCount,
    devtoolsEnabled: appCount > 0,
    installed: true,
    nuxtDetected,
    vitePluginClientUrl: page.__VUE_DEVTOOLS_VITE_PLUGIN_CLIENT_URL__,
    vitePluginDetected: !!page.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__,
    vitePressDetected,
    vueDetected,
  }
}

import { isBrowser } from '@vue/devtools-shared'

import SuperJSON from 'superjson'
import { MergeableChannelOptions } from '../../types'
import { __DEVTOOLS_KIT_IFRAME_MESSAGING_EVENT_KEY, getIframeServerContext } from './context'

export function createIframeServerChannel(): MergeableChannelOptions {
  if (!isBrowser) {
    return {
      post: (data) => {},
      on: (handler) => {},
    }
  }

  // let connected = false
  // let channel = new MessageChannel()
  // let onMessageHandler: (data: any) => void

  // function reconnect() {
  //   channel.port1.close()
  //   channel.port2.close()
  //   channel = new MessageChannel()
  //   channel.port1.onmessage = onMessageHandler
  // }

  // window.addEventListener('message', (event) => {
  //   if (event.data === __DEVTOOLS_KIT_IFRAME_MESSAGING_EVENT_KEY) {
  //     if (connected) {
  //       reconnect()
  //     }
  //     // @ts-expect-error type check
  //     event.source?.postMessage('port', '*', [channel.port2])
  //     connected = true
  //   }
  // })

  return {
    post: (data) => {
      const iframe = getIframeServerContext()
      iframe?.contentWindow?.postMessage(SuperJSON.stringify({
        event: __DEVTOOLS_KIT_IFRAME_MESSAGING_EVENT_KEY,
        data,
      }), '*')
    },
    on: (handler) => {
      window.addEventListener('message', (event) => {
        const iframe = getIframeServerContext()
        try {
          const parsed = SuperJSON.parse<{ event: string, data: unknown }>(event.data)
          if (event.source === iframe?.contentWindow && parsed.event === __DEVTOOLS_KIT_IFRAME_MESSAGING_EVENT_KEY) {
            handler(parsed.data)
          }
        }
        catch (e) {

        }
      })
    },
  }
}

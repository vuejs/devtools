import type { ConnectDevtoolsIframeClientOptions } from './channels/iframe'
import type { ConnectDevtoolsExtensionClientOptions } from './channels/extension'
import type { DevtoolsRpcClient } from './client'
import type { DevtoolsRpcChannelKind } from './types'
import { createExtensionDevtoolsClientHost } from './channels/extension'
import { createIframeDevtoolsClientHost } from './channels/iframe'

export interface DevtoolsClientHost {
  readonly kind: DevtoolsRpcChannelKind
  available(): boolean
  connect(): DevtoolsRpcClient
}

export interface ConnectDevtoolsClientOptions {
  hosts?: DevtoolsClientHost[]
  extension?: ConnectDevtoolsExtensionClientOptions
  iframe?: ConnectDevtoolsIframeClientOptions
}

export function connectDevtoolsClient(
  options: ConnectDevtoolsClientOptions = {},
): DevtoolsRpcClient {
  const hosts = options.hosts ?? getDefaultDevtoolsClientHosts(options)
  const unavailableHosts: DevtoolsRpcChannelKind[] = []

  for (const host of hosts) {
    if (!host.available()) {
      unavailableHosts.push(host.kind)
      continue
    }

    return host.connect()
  }

  throw new Error(
    `No available Vue Devtools client host${
      unavailableHosts.length ? `: ${unavailableHosts.join(', ')}` : ''
    }`,
  )
}

export function getDefaultDevtoolsClientHosts(
  options: ConnectDevtoolsClientOptions = {},
): DevtoolsClientHost[] {
  return [
    createExtensionDevtoolsClientHost(options.extension),
    createIframeDevtoolsClientHost(options.iframe),
  ]
}

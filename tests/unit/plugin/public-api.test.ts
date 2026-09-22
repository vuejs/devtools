import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsKit } from '../../../packages/kit/src/kit'
import type { DevtoolsRpcChannelHandle } from '../../../packages/kit/src/rpc/channel'
import {
  onDevToolsClientConnected,
  onDevToolsConnected,
  setupDevToolsPlugin,
  setupDevtoolsPlugin,
} from '../../../packages/devtools-api/src/index'
import * as nodeApi from '../../../packages/devtools-api/src/index-node'
import { createDevtoolsKit } from '../../../packages/kit/src/kit'
import { createRpcChannelPair } from '../../helpers/rpc-channel'

describe('@vue/devtools-api compatibility entry', () => {
  let channelHandle: DevtoolsRpcChannelHandle | undefined
  let kit: DevtoolsKit | undefined

  afterEach(async () => {
    channelHandle?.dispose()
    channelHandle = undefined
    await kit?.dispose()
    kit = undefined
  })

  it('exports the legacy setupDevtoolsPlugin spelling as an alias', () => {
    expect(setupDevtoolsPlugin).toBe(setupDevToolsPlugin)
  })

  it('registers a plugin through the public compatibility entry', async () => {
    kit = createKit()
    setupDevtoolsPlugin({ id: 'plugin:public-entry', label: 'Public entry' }, (api) => {
      api.addInspector({ id: 'public-entry', label: 'Public entry' })
    })

    await vi.waitFor(() => {
      expect(kit!.plugins.adapters.has('plugin:public-entry')).toBe(true)
      expect(kit!.runtime.inspectors.getInfo('public-entry')).toMatchObject({
        label: 'Public entry',
      })
    })
  })

  it('resolves the runtime lifecycle before and after installation', async () => {
    const beforeInstall = vi.fn()
    const waiting = onDevToolsConnected(beforeInstall)

    kit = createKit()
    await waiting
    expect(beforeInstall).toHaveBeenCalledOnce()

    const afterInstall = vi.fn()
    await onDevToolsConnected(afterInstall)
    expect(afterInstall).toHaveBeenCalledOnce()
  })

  it('resolves the client lifecycle only while an RPC client is attached', async () => {
    kit = createKit()
    const firstCallback = vi.fn()
    const firstConnection = onDevToolsClientConnected(firstCallback)
    const [firstChannel] = createRpcChannelPair()
    channelHandle = kit.rpc.attach(firstChannel)

    await firstConnection
    expect(firstCallback).toHaveBeenCalledOnce()

    channelHandle.dispose()
    channelHandle = undefined

    const reconnectCallback = vi.fn()
    const reconnect = onDevToolsClientConnected(reconnectCallback)
    await Promise.resolve()
    expect(reconnectCallback).not.toHaveBeenCalled()

    const [secondChannel] = createRpcChannelPair()
    channelHandle = kit.rpc.attach(secondChannel)
    await reconnect
    expect(reconnectCallback).toHaveBeenCalledOnce()
  })

  it('keeps every Node and SSR entry as a no-op', async () => {
    const setup = vi.fn()
    nodeApi.setupDevToolsPlugin({ id: 'plugin:ssr' }, setup)
    nodeApi.setupDevtoolsPlugin({ id: 'plugin:ssr-alias' }, setup)
    expect(setup).not.toHaveBeenCalled()

    const connected = vi.fn()
    const clientConnected = vi.fn()
    void nodeApi.onDevToolsConnected(connected)
    void nodeApi.onDevToolsClientConnected(clientConnected)
    await Promise.resolve()

    expect(connected).not.toHaveBeenCalled()
    expect(clientConnected).not.toHaveBeenCalled()
  })

  function createKit(): DevtoolsKit {
    const created = createDevtoolsKit({
      target: { name: 'Public API Test' },
      hook: { install: false },
    })
    created.install()
    return created
  }
})

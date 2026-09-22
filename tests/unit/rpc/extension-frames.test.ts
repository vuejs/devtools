import { describe, expect, it, vi } from 'vitest'
import type {
  ChromeExtensionApi,
  DevtoolsExtensionFrameSelectMessage,
} from '../../../packages/kit/src/rpc/channels/extension'
import {
  connectDevtoolsExtensionClient,
  createChromeRuntimePortDevtoolsRpcChannel,
  DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
} from '../../../packages/kit/src/rpc/channels/extension'
import { MockChromeRuntimePort } from '../../helpers/chrome-port'

function createChromeApi(port: MockChromeRuntimePort): ChromeExtensionApi {
  return {
    devtools: { inspectedWindow: { tabId: 1 } },
    runtime: {
      connect: () => port,
    },
  }
}

describe('extension RPC frame control', () => {
  it('filters frame control messages out of the RPC channel', () => {
    const port = new MockChromeRuntimePort('panel')
    const channel = createChromeRuntimePortDevtoolsRpcChannel(port)
    const handler = vi.fn()

    channel.on(handler)
    port.receive({
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:changed',
      frames: [],
    })
    port.receive({ id: 'rpc-message' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ id: 'rpc-message' })
  })

  it('tracks frames and the active frame from control messages', () => {
    const port = new MockChromeRuntimePort('panel')
    const client = connectDevtoolsExtensionClient({ chrome: createChromeApi(port) })
    const framesChanged = vi.fn()
    const frameActivated = vi.fn()

    client.frames.onFramesChanged(framesChanged)
    client.frames.onFrameActivated(frameActivated)

    port.receive({
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:changed',
      frames: [
        { frameId: 0, main: true, url: 'https://app.example/' },
        { frameId: 4, main: false, url: 'https://widget.example/' },
      ],
      activeFrameId: 0,
    })
    port.receive({
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:activated',
      frame: { frameId: 4, main: false, url: 'https://widget.example/' },
      reason: 'select',
    })

    expect(client.frames.getFrames()).toHaveLength(2)
    expect(client.frames.getActiveFrameId()).toBe(4)
    expect(framesChanged).toHaveBeenCalledWith(expect.any(Array), 0)
    expect(frameActivated).toHaveBeenCalledWith(expect.objectContaining({ frameId: 4 }), 'select')
  })

  it('posts a frames:select control message when selecting a frame', () => {
    const port = new MockChromeRuntimePort('panel')
    const client = connectDevtoolsExtensionClient({ chrome: createChromeApi(port) })

    client.frames.selectFrame(7)

    const selectMessage = port.messages.find(
      (message): message is DevtoolsExtensionFrameSelectMessage =>
        (message as DevtoolsExtensionFrameSelectMessage)?.type === 'frames:select',
    )
    expect(selectMessage).toMatchObject({
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      frameId: 7,
    })
  })

  it('stops emitting frame events after the client is disposed', () => {
    const port = new MockChromeRuntimePort('panel')
    const client = connectDevtoolsExtensionClient({ chrome: createChromeApi(port) })
    const framesChanged = vi.fn()

    client.frames.onFramesChanged(framesChanged)
    client.dispose()
    port.receive({
      source: DEVTOOLS_EXTENSION_FRAME_CONTROL_SOURCE,
      type: 'frames:changed',
      frames: [],
    })

    expect(framesChanged).not.toHaveBeenCalled()
  })
})

import type { DevtoolsRpcChannel } from '../../packages/kit/src/rpc/channel'

export function createRpcChannelPair(): [DevtoolsRpcChannel, DevtoolsRpcChannel] {
  const firstListeners = new Set<(data: unknown) => void>()
  const secondListeners = new Set<(data: unknown) => void>()

  return [
    createChannel(firstListeners, secondListeners),
    createChannel(secondListeners, firstListeners),
  ]
}

function createChannel(
  ownListeners: Set<(data: unknown) => void>,
  peerListeners: Set<(data: unknown) => void>,
): DevtoolsRpcChannel {
  return {
    off(handler) {
      ownListeners.delete(handler)
    },
    on(handler) {
      ownListeners.add(handler)
    },
    post(data) {
      queueMicrotask(() => {
        for (const listener of peerListeners) listener(data)
      })
    },
  }
}

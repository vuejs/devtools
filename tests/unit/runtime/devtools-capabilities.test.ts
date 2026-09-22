import type { DevtoolsCapabilitiesMessage, DevtoolsKit } from '../../../packages/kit/src'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevtoolsKit } from '../../../packages/kit/src'

let kit: DevtoolsKit | undefined

afterEach(async () => {
  await kit?.dispose()
  kit = undefined
})

describe('DevTools capabilities', () => {
  it('disables optional capabilities by default', async () => {
    kit = createDevtoolsKit({ target: { name: 'Default Host' } })

    await expect(readCapabilities(kit)).resolves.toEqual({
      openInEditor: false,
      pagedComponentTree: true,
    })
  })

  it('publishes open-in-editor support when configured', async () => {
    kit = createDevtoolsKit({
      target: { name: 'Vite Dock' },
      capabilities: { openInEditor: true },
    })

    await expect(readCapabilities(kit)).resolves.toEqual({
      openInEditor: true,
      pagedComponentTree: true,
    })
  })
})

function readCapabilities(kit: DevtoolsKit): Promise<DevtoolsCapabilitiesMessage> {
  return kit.runtime.query({ type: 'devtools:capabilities' })
}

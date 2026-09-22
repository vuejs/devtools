// @vitest-environment happy-dom

import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelComponentInspection,
  inspectComponentInPage,
} from '../../../packages/kit/src/runtime/component-inspector'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

const OVERLAY_ID = '__vue-devtools-component-inspector__'

describe('component inspector lifecycle', () => {
  let runtime: DevtoolsRuntime | undefined

  afterEach(() => {
    cancelComponentInspection()
    runtime?.dispose()
    runtime = undefined
    document.getElementById(OVERLAY_ID)?.remove()
  })

  it('cleans up when explicitly cancelled', async () => {
    runtime = createDevtoolsRuntime()
    const inspection = startInspection(runtime)

    cancelComponentInspection()

    await expect(inspection).resolves.toBeUndefined()
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('cleans up when the inspected app unmounts', async () => {
    runtime = createDevtoolsRuntime()
    const app = {}
    runtime.dispatch({ app, time: 1, type: 'app:init', version: '3.5.0', vueTypes: {} })
    const inspection = startInspection(runtime)

    runtime.dispatch({ app, time: 2, type: 'app:unmount' })

    await expect(inspection).resolves.toBeUndefined()
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('cleans up when the last panel client disconnects', async () => {
    runtime = createDevtoolsRuntime()
    runtime.setCollectionActive(true, 1)
    const inspection = startInspection(runtime)

    runtime.setCollectionActive(false, 0)

    await expect(inspection).resolves.toBeUndefined()
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('cleans up when the runtime is disposed', async () => {
    runtime = createDevtoolsRuntime()
    const inspection = startInspection(runtime)

    runtime.dispose()
    runtime = undefined

    await expect(inspection).resolves.toBeUndefined()
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })
})

function startInspection(runtime: DevtoolsRuntime): Promise<undefined | { appId: string }> {
  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  document.body.append(overlay)
  return inspectComponentInPage(runtime) as Promise<undefined | { appId: string }>
}

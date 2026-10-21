// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
// The package root resolves to a Node build without Vapor; the browser bundle includes it.
import {
  createVaporApp,
  defineVaporComponent,
} from 'vue-3.6/dist/vue.runtime-with-vapor.esm-browser.js'
import { RuntimeRegistry } from '../../../packages/kit/src/runtime/registry'
import {
  isForFragment,
  isInteropFragment,
  isTeleportFragment,
  isVaporApp,
  isVaporFragment,
  isVaporInstance,
  VF,
} from '../../../packages/kit/src/runtime/vapor'

describe('vapor guards', () => {
  it('detects Vapor instances and apps by the `vapor` flag', () => {
    expect(isVaporInstance({ vapor: true })).toBe(true)
    expect(isVaporInstance({ vapor: 1 })).toBe(false)
    expect(isVaporInstance({ subTree: {} })).toBe(false)
    expect(isVaporInstance(null)).toBe(false)
    expect(isVaporApp({ vapor: true })).toBe(true)
    expect(isVaporApp({})).toBe(false)
  })

  it('detects fragments by `__vf` bits', () => {
    expect(isVaporFragment({ __vf: VF.FRAGMENT, nodes: [] })).toBe(true)
    expect(isVaporFragment({ __vf: VF.FRAGMENT })).toBe(false)
    expect(isVaporFragment({ __vf: '1', nodes: [] })).toBe(false)
    expect(isInteropFragment({ __vf: VF.INTEROP | VF.FRAGMENT, nodes: [] })).toBe(true)
    expect(isTeleportFragment({ __vf: VF.TELEPORT, nodes: [] })).toBe(true)
    expect(isForFragment({ __vf: VF.FOR, nodes: [[]] })).toBe(true)
    expect(isForFragment({ __vf: VF.FOR_BLOCK, nodes: [] })).toBe(false)
  })

  it('matches a real createVaporApp', () => {
    const app = createVaporApp(defineVaporComponent({ name: 'Root', setup: () => [] }))
    app.mount(document.createElement('div'))

    expect(isVaporApp(app)).toBe(true)
    expect(isVaporInstance(app._instance)).toBe(true)
    app.unmount()
  })
})

describe('RuntimeRegistry vapor apps', () => {
  it('stores `record.vapor` only for Vapor apps', () => {
    const registry = new RuntimeRegistry()

    expect(registry.addApp({ vapor: true }, '3.6.0', {}, 1).vapor).toBe(true)
    expect(registry.addApp({}, '3.5.0', {}, 1).vapor).toBeUndefined()
  })
})

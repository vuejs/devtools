// @vitest-environment happy-dom

import type { DevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelComponentInspection,
  inspectComponentInPage,
} from '../../../packages/kit/src/runtime/component-inspector'
import { createDevtoolsRuntime } from '../../../packages/kit/src/runtime/runtime'

const OVERLAY_ID = '__vue-devtools-component-inspector__'
const NAME_ID = '__vue-devtools-component-inspector__name__'

// issue-487: https://github.com/vuejs/devtools/issues/487
describe('component inspector page locator', () => {
  let runtime: DevtoolsRuntime | undefined

  afterEach(() => {
    cancelComponentInspection()
    runtime?.dispose()
    runtime = undefined
    document.getElementById(OVERLAY_ID)?.remove()
    document.body.replaceChildren()
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
  })

  it('highlights and selects a nested child when a parent stops bubble mouseover', async () => {
    runtime = createDevtoolsRuntime()
    const { child, childId } = mountStoppedParentTree(runtime)
    const inspection = inspectComponentInPage(runtime)

    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))

    expect(document.getElementById(NAME_ID)?.textContent).toBe('<Child>  ')

    child.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await expect(inspection).resolves.toEqual({ appId: 'app:0', componentId: childId })
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('clears a stale hover and does not intercept a non-Vue click', async () => {
    runtime = createDevtoolsRuntime()
    const { child, childId } = mountStoppedParentTree(runtime)
    const outside = document.createElement('button')
    document.body.append(outside)
    const inspection = inspectComponentInPage(runtime)
    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    outside.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    outside.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await expect(inspection).resolves.toEqual({ appId: 'app:0', componentId: childId })
  })

  it('registers an unloaded child and returns its path without loading siblings', async () => {
    runtime = createDevtoolsRuntime({ budget: { components: { maxInitialDepth: 0 } } })
    const { child, childInstance } = mountStoppedParentTree(runtime, false)
    const leaf = document.createElement('b')
    child.append(leaf)
    const instance = {
      uid: 2,
      parent: childInstance,
      type: { name: 'Leaf' },
      subTree: { el: leaf },
    }
    Object.assign(leaf, { __vueParentComponent: instance })
    stubBounds(leaf, { left: 10, top: 10, width: 20, height: 10 })
    expect(runtime.registry.getComponentId(childInstance)).toBeUndefined()
    const inspection = runtime.query({ type: 'components:inspect' })
    leaf.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(document.getElementById(NAME_ID)?.textContent).toBe('<Leaf>  ')
    leaf.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const result = await inspection
    expect(result?.componentId).toBe(runtime.registry.getComponentId(instance))
    expect(result?.nodes?.map((node) => node.name)).toEqual(['Parent', 'Child', 'Leaf'])
    expect(result?.nodes?.[2]?.parentId).toBe(runtime.registry.getComponentId(childInstance))
    expect(runtime.registry.getApp('app:0')?.components.size).toBe(3)
  })

  it('does not highlight after the capture mouseover listener is removed', async () => {
    runtime = createDevtoolsRuntime()
    const { child } = mountStoppedParentTree(runtime)
    const inspection = inspectComponentInPage(runtime)

    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    expect(document.getElementById(OVERLAY_ID)).not.toBeNull()

    cancelComponentInspection()
    await expect(inspection).resolves.toBeUndefined()
    expect(document.getElementById(OVERLAY_ID)).toBeNull()

    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('keeps the highlight below the DevTools client dock', async () => {
    runtime = createDevtoolsRuntime()
    const { child } = mountStoppedParentTree(runtime)
    const showPopover = vi.fn()
    HTMLElement.prototype.showPopover = showPopover
    const inspection = inspectComponentInPage(runtime)

    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))

    const overlay = document.getElementById(OVERLAY_ID)
    expect(overlay).not.toBeNull()
    expect(overlay?.hasAttribute('popover')).toBe(false)
    expect(showPopover).not.toHaveBeenCalled()

    cancelComponentInspection()
    await expect(inspection).resolves.toBeUndefined()
  })
})

function mountStoppedParentTree(runtime: DevtoolsRuntime, registerChild = true) {
  const parentEl = document.createElement('div')
  const childEl = document.createElement('span')
  parentEl.append(childEl)
  document.body.append(parentEl)

  parentEl.addEventListener('mouseover', (event) => {
    event.stopPropagation()
  })

  stubBounds(parentEl, { left: 0, top: 0, width: 200, height: 80 })
  stubBounds(childEl, { left: 8, top: 8, width: 80, height: 24 })

  const parent = {
    uid: 0,
    type: { name: 'Parent' },
    subTree: { el: parentEl },
  }
  const child = {
    parent,
    uid: 1,
    type: { name: 'Child' },
    subTree: { el: childEl },
  }

  Object.assign(parentEl, { __vueParentComponent: parent })
  Object.assign(childEl, { __vueParentComponent: child })

  runtime.dispatch({
    app: { _component: { name: 'Locator App' }, _instance: parent },
    time: 1,
    type: 'app:init',
    version: '3.5.0',
    vueTypes: {},
  })
  if (registerChild)
    runtime.dispatch({
      appId: 'app:0',
      instance: child,
      parent,
      time: 2,
      type: 'component:add',
    })

  return {
    child: childEl,
    childInstance: child,
    childId: runtime.registry.getComponentId(child)!,
    parent: parentEl,
  }
}

function stubBounds(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return rect
      },
    }) as DOMRect
}

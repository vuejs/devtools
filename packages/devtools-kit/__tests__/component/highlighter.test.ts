import { afterEach, beforeEach, vi } from 'vitest'
import { cancelInspectComponentHighLighter, inspectComponentHighLighter } from '../../src/core/component-highlighter'
import * as boundingRect from '../../src/core/component/state/bounding-rect'

vi.mock('../../src/ctx', () => ({ activeAppRecord: { value: null } }))

function makeFakeInstance(el: HTMLElement) {
  return {
    uid: 42,
    vnode: { el, key: null },
    subTree: { el, type: {} },
    type: { name: 'FakeComp' },
    appContext: { app: { __VUE_DEVTOOLS_NEXT_APP_RECORD_ID__: 0 } },
  } as any
}

const CONTAINER_ID = '__vue-devtools-component-inspector__'

beforeEach(() => {
  document.body.innerHTML = ''
  vi.spyOn(boundingRect, 'getComponentBoundingRect').mockReturnValue({
    top: 10,
    left: 10,
    width: 100,
    height: 50,
  } as any)
})

afterEach(() => {
  cancelInspectComponentHighLighter()
  vi.restoreAllMocks()
})

describe('inspectFn DOM walking', () => {
  it('highlights and selects when __vueParentComponent is on the exact target element', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const instance = makeFakeInstance(div)
    ;(div as any).__vueParentComponent = instance

    const promise = inspectComponentHighLighter()

    // hover → highlight overlay is created
    div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await Promise.resolve()
    expect(document.getElementById(CONTAINER_ID)).not.toBeNull()

    // click → promise resolves with the selected component id
    div.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const result = await promise
    expect(JSON.parse(result)).toMatchObject({ id: '0:42' })
  })

  it('highlights when __vueParentComponent is only on a parent element (JSX case)', async () => {
    // In JSX/functional components __vueParentComponent is often only on the
    // root element of the component, not on every inner child.
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    document.body.appendChild(parent)

    const instance = makeFakeInstance(parent)
    ;(parent as any).__vueParentComponent = instance
    // child deliberately has NO __vueParentComponent set

    const promise = inspectComponentHighLighter()

    // hover on child — the walker should climb to parent and find the instance
    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await Promise.resolve()
    expect(document.getElementById(CONTAINER_ID)).not.toBeNull()

    // click to resolve
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const result = await promise
    expect(JSON.parse(result)).toMatchObject({ id: '0:42' })
  })

  it('does not create a highlight overlay when no ancestor has __vueParentComponent', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    // no __vueParentComponent anywhere in the tree

    inspectComponentHighLighter()

    div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await Promise.resolve()

    expect(document.getElementById(CONTAINER_ID)).toBeNull()
    cancelInspectComponentHighLighter()
  })
})

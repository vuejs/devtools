import type { ElementTraceInfo } from './client'
import { reactive, watchEffect } from 'vue'
import { events, getInternalStore, isEnabled, lastMatchedElement } from './listeners'

export * from './listeners'

interface OverlayState {
  isEnabled: boolean
  isVisible: boolean
  isAnimated: boolean
  isFocused: boolean
  main?: ElementTraceInfo
  mainRect?: DOMRect
  sub: { rects?: { id: string; rect: DOMRect }[] }
}

function createOverlayState(): OverlayState {
  const state = reactive({
    isEnabled,
    isVisible: false,
    isAnimated: true,
    isFocused: false,
    main: undefined as ElementTraceInfo | undefined,
    mainRect: undefined as DOMRect | undefined,
    sub: {} as OverlayState['sub'],
  })
  if (typeof document === 'undefined') return state

  let overlay: HTMLDivElement | undefined
  let label: HTMLDivElement | undefined
  let svg: SVGSVGElement | undefined
  let mainRect: SVGRectElement | undefined
  const elements = new WeakMap<Element, string>()
  let nextId = 0
  const subRects = new Map<string, SVGRectElement>()
  function update(info = lastMatchedElement.value) {
    state.main = info
    state.mainRect = info?.rect
    state.sub.rects = info?.getElementsSamePosition()?.map((el) => {
      if (!elements.has(el)) elements.set(el, String(++nextId))
      return { id: elements.get(el)!, rect: el.getBoundingClientRect() }
    })
    state.isVisible = !!info
  }
  const refresh = () => update()
  events.on('hover', update)
  events.on('disabled', () => {
    update(undefined)
    state.isVisible = false
  })
  events.on('enabled', () => {
    document.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
  })
  events.on('disabled', () => {
    document.removeEventListener('scroll', refresh, true)
    window.removeEventListener('resize', refresh)
  })
  if (isEnabled.value) {
    document.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
  }

  function rectNode() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  }
  function position(node: SVGRectElement, rect: DOMRect, padding = 0) {
    node.setAttribute('x', String(rect.left - padding))
    node.setAttribute('y', String(rect.top - padding))
    node.setAttribute('width', String(rect.width + padding * 2))
    node.setAttribute('height', String(rect.height + padding * 2))
    node.setAttribute('rx', String(padding ? 8 : 4))
    node.setAttribute('ry', String(padding ? 8 : 4))
    node.style.transition = state.isAnimated ? 'all 0.15s' : 'none'
  }
  watchEffect(
    () => {
      if (!state.isEnabled && !state.isVisible) {
        overlay?.remove()
        overlay = undefined
        subRects.clear()
        return
      }
      if (!document.body) return
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.id = 'vue-tracer-overlay'
        Object.assign(overlay.style, {
          position: 'fixed',
          inset: '0',
          zIndex: '2147483647',
          pointerEvents: 'none',
        })
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', '100%')
        svg.setAttribute('height', '100%')
        mainRect = rectNode()
        mainRect.setAttribute('stroke', '#197')
        svg.appendChild(mainRect)
        label = document.createElement('div')
        Object.assign(label.style, {
          position: 'fixed',
          background: '#197',
          color: '#fff',
          font: '12px monospace',
          padding: '2px 4px',
          whiteSpace: 'nowrap',
        })
        overlay.append(svg, label)
        document.body.appendChild(overlay)
      }
      overlay.hidden = !state.isVisible
      overlay.style.transition = state.isAnimated ? 'all 0.15s' : 'none'
      if (state.mainRect && mainRect) {
        position(mainRect, state.mainRect, state.isFocused ? 10 : 0)
        mainRect.setAttribute('fill', state.isFocused ? 'transparent' : '#1972')
        mainRect.style.filter = state.isFocused ? 'blur(1px)' : ''
      }
      if (label) {
        const type = state.main?.vnode?.type
        const name =
          typeof type === 'string'
            ? type
            : type && typeof type === 'object' && 'name' in type
              ? type.name
              : undefined
        label.textContent = state.main
          ? `${name ? `<${name}> ` : ''}${state.main.pos.join(':')}`
          : ''
        label.hidden = state.isFocused || !state.mainRect
        label.style.transition = state.isAnimated ? 'all 0.15s' : 'none'
        label.style.left = `${(state.mainRect?.left ?? 0) + 3}px`
        label.style.top = `${(state.mainRect?.bottom ?? 0) - 1}px`
      }
      const stale = new Set(subRects.keys())
      for (const { id, rect } of state.sub.rects || []) {
        stale.delete(id)
        let node = subRects.get(id)
        if (!node) {
          node = rectNode()
          node.setAttribute('data-tracer-sub', id)
          node.setAttribute('fill', '#8482')
          node.setAttribute('stroke', '#848')
          subRects.set(id, node)
          svg?.appendChild(node)
        }
        position(node, rect)
      }
      for (const id of stale) {
        subRects.get(id)?.remove()
        subRects.delete(id)
      }
    },
    { flush: 'sync' },
  )
  return state
}

const store = getInternalStore() as ReturnType<typeof getInternalStore> & { overlay?: OverlayState }
export const state = (store.overlay ||= createOverlayState())

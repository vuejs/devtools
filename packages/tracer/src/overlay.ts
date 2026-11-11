import type { PositionInfo } from './client'
import { findElementPosition, getElementPosition } from './client'

export interface TracerOverlayOptions {
  onPick: (position: PositionInfo) => void
  onCancel: () => void
}

function isIgnoredEvent(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        (target.localName === 'devframes-dock-embedded' ||
          target.hasAttribute('data-v-inspector-ignore')),
    )
}

export function createTracerOverlay(options: TracerOverlayOptions) {
  let overlay: HTMLDivElement | undefined
  let label: HTMLDivElement | undefined
  let hovered: Element | undefined

  function dispose(): void {
    if (!overlay) return
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('scroll', update, true)
    window.removeEventListener('resize', update)
    overlay.remove()
    overlay = undefined
    label = undefined
    hovered = undefined
  }

  function update(): void {
    if (!overlay || !label) return
    const match = hovered && findElementPosition(hovered)
    overlay.hidden = !match
    if (!match) return
    const rect = match.el.getBoundingClientRect()
    Object.assign(overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    label.textContent = `${match.pos[0]}:${match.pos[1]}:${match.pos[2] + 1}`
  }

  function onPointerMove(event: PointerEvent): void {
    hovered = !isIgnoredEvent(event) && event.target instanceof Element ? event.target : undefined
    update()
  }

  function onClick(event: MouseEvent): void {
    if (isIgnoredEvent(event)) {
      hovered = undefined
      update()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!(event.target instanceof Element)) return
    const position = getElementPosition(event.target)
    if (!position) return
    dispose()
    options.onPick(position)
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    dispose()
    options.onCancel()
  }

  function enable(): void {
    if (overlay || typeof document === 'undefined') return
    overlay = document.createElement('div')
    overlay.id = 'vue-tracer-overlay'
    overlay.hidden = true
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'none',
      border: '1px solid #197',
      background: '#11997722',
      boxSizing: 'border-box',
    })
    label = document.createElement('div')
    Object.assign(label.style, {
      position: 'absolute',
      top: '100%',
      left: '0',
      background: '#197',
      color: '#fff',
      font: '12px monospace',
      padding: '2px 4px',
      whiteSpace: 'nowrap',
    })
    overlay.appendChild(label)
    document.body.appendChild(overlay)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
  }

  return { enable, dispose }
}

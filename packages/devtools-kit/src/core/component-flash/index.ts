import { ComponentHighLighterOptions, VueAppInstance } from '../../../types'
import { getComponentBoundingRect } from '../component/state/bounding-rect'
import { getInstanceName } from '../component/utils'

const CONTAINER_ELEMENT_ID = '__vue-devtools-flash__'
const REMOVE_DELAY_MS = 1000

const containerStyles = {
  border: '2px rgba(65, 184, 131, 0.7) solid',
  position: 'fixed',
  zIndex: '2147483645',
  pointerEvents: 'none',
  borderRadius: '3px',
  boxSizing: 'border-box',
  transition: 'none',
  opacity: '1',
}

function getStyles(bounds: ComponentHighLighterOptions['bounds']) {
  return {
    left: `${Math.round(bounds.left)}px`,
    top: `${Math.round(bounds.top)}px`,
    width: `${Math.round(bounds.width)}px`,
    height: `${Math.round(bounds.height)}px`,
  } satisfies Partial<CSSStyleDeclaration>
}

function create(options: ComponentHighLighterOptions & { elementId?: string, style?: Partial<CSSStyleDeclaration> }) {
  const containerEl = document.createElement('div')
  containerEl.id = options?.elementId ?? CONTAINER_ELEMENT_ID

  Object.assign(containerEl.style, {
    ...containerStyles,
    ...getStyles(options.bounds),
    ...options.style,
  })

  document.body.appendChild(containerEl)

  requestAnimationFrame(() => {
    containerEl.style.transition = 'opacity 1s'
    containerEl.style.opacity = '0'
  })

  clearTimeout((containerEl as any)?._timer);
  (containerEl as any)._timer = setTimeout(() => {
    document.body.removeChild(containerEl)
  }, REMOVE_DELAY_MS)

  return containerEl
}

export function flashComponent(instance: VueAppInstance) {
  const bounds = getComponentBoundingRect(instance)

  if (!bounds.width && !bounds.height)
    return

  const name = getInstanceName(instance)
  create({ bounds, name })
}

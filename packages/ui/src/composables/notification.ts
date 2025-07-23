import { h, render } from 'vue'
import Notification from '../components/Notification.vue'

// @unocss-include

export type VueNotificationPlacement
  = | 'top-left' | 'top-center' | 'top-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface VueNotificationOptions {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  classes?: string
  duration?: number
  placement?: VueNotificationPlacement
  onClose?: () => void
}

export function showVueNotification(options: VueNotificationOptions) {
  const container = document.createElement('div')
  container.classList.add('$ui-z-max-override', 'fixed')
  document.body.appendChild(container)
  const originalOnClose = options.onClose
  function hide() {
    render(null, container)
  }

  options.onClose = () => {
    hide()
    originalOnClose?.()
    document.body.removeChild(container)
  }
  const vNode = h(Notification, options)
  render(vNode, container)
}

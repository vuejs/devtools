import type { VNode } from 'vue'

type TabCategory =
  | 'pinned'
  | 'app'
  | 'modules'
  | 'advanced'

export type ModuleView = ModuleIframeView | ModuleVNodeView | ModuleSFCView

export interface ModuleIframeView {
  /**
   * Iframe view
   */
  type: 'iframe'
  /**
   * Url of the iframe
   */
  src: string
  /**
   * Persist the iframe instance even if the tab is not active
   *
   * @default true
   */
  persistent?: boolean

  /**
   * Triggered when the iframe is loaded
   *
   * @param iframe The iframe element
   */
  onLoad?: (iframe: HTMLIFrameElement) => void

  /**
   * Triggered when the iframe is closed if {@link persistent} is false
   *
   * @param iframe The iframe element
   */
  onClose?: (iframe: HTMLIFrameElement) => void
}

export interface ModuleVNodeView {
  /**
   * Vue's VNode view
   */
  type: 'vnode'
  /**
   * Send vnode to the client, they must be static and serializable
   */
  vnode: VNode
}

export interface ModuleSFCView {
  /**
   * SFC view
   */
  type: 'sfc'
  /**
   * SFC component
   */
  sfc: string
}

export interface CustomTab {
  /**
   * The name of the tab, must be unique
   */
  name: string
  /**
   * Icon of the tab, support any Iconify icons, or a url to an image
   */
  icon?: string
  /**
   * Title of the tab
   */
  title: string
  /**
   * Main view of the tab
   */
  view: ModuleView
  /**
   * Category of the tab
   * @default 'app'
   */
  category?: TabCategory
}

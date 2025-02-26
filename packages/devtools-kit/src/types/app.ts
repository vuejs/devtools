import type { ComponentInternalInstance, ComponentOptions, SuspenseBoundary } from 'vue'

export type App = any

export type VueAppInstance = ComponentInternalInstance & {
  type: {
    _componentTag: string | undefined
    components: Record<string, ComponentInternalInstance['type']>
    __VUE_DEVTOOLS_COMPONENT_GUSSED_NAME__: string
    __isKeepAlive: boolean
    devtools: {
      hide: boolean
    }
    mixins: ComponentOptions[]
    extends: ComponentOptions
    vuex: {
      getters: Record<string, unknown>
    }
    computed: Record<string, unknown>
  }
  __v_cache: Cache
  __VUE_DEVTOOLS_NEXT_UID__: string
  _isBeingDestroyed: boolean
  _instance: VueAppInstance
  _container: {
    _vnode: {
      component: VueAppInstance
    }
  }
  isUnmounted: boolean
  parent: VueAppInstance
  appContext: {
    app: VueAppInstance & App & {
      __VUE_DEVTOOLS_NEXT_APP_RECORD_ID__: string
      __VUE_DEVTOOLS_NEXT_APP_RECORD__: AppRecord
    }
  }
  __VUE_DEVTOOLS_NEXT_APP_RECORD__: AppRecord
  suspense: SuspenseBoundary & { suspenseKey: string }
  renderContext: Record<string, unknown>
  devtoolsRawSetupState: Record<string, unknown>
  setupState: Record<string, unknown>
  provides: Record<string | symbol, unknown>
  ctx: Record<string, unknown>
} & App
export interface AppRecord {
  id: string
  name: string
  app?: App
  version?: string
  types?: Record<string, string | symbol>
  instanceMap: Map<string, VueAppInstance>
  perfGroupIds: Map<string, { groupId: number, time: number }>
  rootInstance: VueAppInstance
  routerId?: string
}

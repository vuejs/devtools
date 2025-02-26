<script setup lang="ts">
import { onRpcSeverReady, rpcServer } from '@vue/devtools-core'
import { useEventListener } from '@vueuse/core'
import { computed, ref, watchEffect } from 'vue'
import { useFrameState } from '~/composables'
import { PANEL_MAX, PANEL_MIN } from '~/constants'

const props = defineProps<{
  isDragging: boolean

  client: {
    close: () => void
    getIFrame: () => HTMLIFrameElement
    // inspector: {
    //   isEnabled: Ref<boolean>
    //   disable: () => void
    // } | undefined
  }
  viewMode: 'xs' | 'default' | 'fullscreen'

}>()

const { state, updateState } = useFrameState()
const container = ref<HTMLElement>()
const isResizing = ref<false | { top?: boolean, left?: boolean, right?: boolean, bottom?: boolean }>(false)

onRpcSeverReady(() => {
  // @ts-expect-error skip
  rpcServer.functions.on('update-client-state', (v) => {
    if (v) {
      updateState({
        minimizePanelInactive: v.minimizePanelInteractive,
        closeOnOutsideClick: v.closeOnOutsideClick,
        preferShowFloatingPanel: v.showFloatingPanel,
        reduceMotion: v.reduceMotion,
      })
    }
  })
})

watchEffect(() => {
  if (!container.value)
    return
  if (state.value.open) {
    const iframe = props.client.getIFrame()
    iframe.style.pointerEvents = (isResizing.value || props.isDragging) ? 'none' : 'auto'

    if (Array.from(container.value.children).every(el => el !== iframe))
      container.value.appendChild(iframe)
  }
})

useEventListener(window, 'keydown', (e) => {
  // if (e.key === 'Escape' && props.client.inspector?.isEnabled.value) {
  //   e.preventDefault()
  //   props.client.inspector?.disable()
  //   props.client.close()
  // }
})

useEventListener(window, 'mousedown', (e: MouseEvent) => {
  if (!state.value.closeOnOutsideClick)
    return
  // if (popupWindow.value)
  //   return
  if (!state.value.open || isResizing.value)
    return

  const matched = e.composedPath().find((_el) => {
    const el = _el as HTMLElement
    return Array.from(el.classList || []).some(c => c.startsWith('vue-devtools'))
      || el.tagName?.toLowerCase() === 'iframe'
  })

  if (!matched) {
    updateState({
      open: false,
    })
  }
})

useEventListener(window, 'mousemove', (e) => {
  if (!isResizing.value)
    return
  if (!state.value.open)
    return

  const iframe = props.client.getIFrame()
  const box = iframe.getBoundingClientRect()

  if (isResizing.value.right) {
    const widthPx = Math.abs(e.clientX - (box?.left || 0))
    const width = widthPx / window.innerWidth * 100
    updateState({
      width: Math.min(PANEL_MAX, Math.max(PANEL_MIN, width)),
    })
  }
  else if (isResizing.value.left) {
    const widthPx = Math.abs((box?.right || 0) - e.clientX)
    const width = widthPx / window.innerWidth * 100
    updateState({
      width: Math.min(PANEL_MAX, Math.max(PANEL_MIN, width)),
    })
  }

  if (isResizing.value.top) {
    const heightPx = Math.abs((box?.bottom || 0) - e.clientY)
    const height = heightPx / window.innerHeight * 100
    updateState({
      height: Math.min(PANEL_MAX, Math.max(PANEL_MIN, height)),
    })
  }
  else if (isResizing.value.bottom) {
    const heightPx = Math.abs(e.clientY - (box?.top || 0))
    const height = heightPx / window.innerHeight * 100
    updateState({
      height: Math.min(PANEL_MAX, Math.max(PANEL_MIN, height)),
    })
  }
})

useEventListener(window, 'mouseup', () => {
  isResizing.value = false
})

useEventListener(window, 'mouseleave', () => {
  isResizing.value = false
})

const viewModeClass = computed(() => {
  if (props.viewMode === 'xs')
    return 'view-mode-xs'
  if (props.viewMode === 'fullscreen')
    return 'view-mode-fullscreen'
  return ''
})
</script>

<template>
  <div v-show="state.open" ref="container" class="vue-devtools-frame" :class="viewModeClass">
    <!-- Handlers -->
    <div
      v-show="state.position !== 'top'" class="vue-devtools-resize vue-devtools-resize--horizontal" :style="{ top: 0 }"
      @mousedown.prevent="() => isResizing = { top: true }"
    />
    <div
      v-show="state.position !== 'bottom'" class="vue-devtools-resize vue-devtools-resize--horizontal"
      :style="{ bottom: 0 }" @mousedown.prevent="() => isResizing = { bottom: true }"
    />
    <div
      v-show="state.position !== 'left'" class="vue-devtools-resize vue-devtools-resize--vertical" :style="{ left: 0 }"
      @mousedown.prevent="() => isResizing = { left: true }"
    />
    <div
      v-show="state.position !== 'right'" class="vue-devtools-resize vue-devtools-resize--vertical"
      :style="{ right: 0 }" @mousedown.prevent="() => isResizing = { right: true }"
    />
    <div
      v-show="state.position !== 'top' && state.position !== 'left'"
      class="vue-devtools-resize vue-devtools-resize-corner" :style="{ top: 0, left: 0, cursor: 'nwse-resize' }"
      @mousedown.prevent="() => isResizing = { top: true, left: true }"
    />
    <div
      v-show="state.position !== 'top' && state.position !== 'right'"
      class="vue-devtools-resize vue-devtools-resize-corner" :style="{ top: 0, right: 0, cursor: 'nesw-resize' }"
      @mousedown.prevent="() => isResizing = { top: true, right: true }"
    />
    <div
      v-show="state.position !== 'bottom' && state.position !== 'left'"
      class="vue-devtools-resize vue-devtools-resize-corner" :style="{ bottom: 0, left: 0, cursor: 'nesw-resize' }"
      @mousedown.prevent="() => isResizing = { bottom: true, left: true }"
    />
    <div
      v-show="state.position !== 'bottom' && state.position !== 'right'"
      class="vue-devtools-resize vue-devtools-resize-corner" :style="{ bottom: 0, right: 0, cursor: 'nwse-resize' }"
      @mousedown.prevent="() => isResizing = { bottom: true, right: true }"
    />
  </div>
</template>

<style scoped lang="scss">
.vue-devtools-frame {
  position: fixed;
  z-index: 2147483645;

  :deep(iframe) {
    width: 100%;
    height: 100%;
    outline: none;
    background: var(--vue-devtools-widget-bg);
    border: 1px solid rgba(125, 125, 125, 0.2);
    border-radius: 10px;
  }

  &.view-mode-xs {
    width: 400px !important;
    height: 80px !important;
  }

  &.view-mode-fullscreen {
    width: 100vw !important;
    height: 100vh !important;
    z-index: 1 !important;
    bottom: 0 !important;
    transform: none !important;

    :deep(iframe) {
      border-radius: 0 !important;
    }
  }
}

.vue-devtools-resize {
  &--horizontal {
    position: absolute;
    left: 6px;
    right: 6px;
    height: 10px;
    margin: -5px 0;
    cursor: ns-resize;
    border-radius: 5px;
  }

  &--vertical {
    position: absolute;
    top: 6px;
    bottom: 0;
    width: 10px;
    margin: 0 -5px;
    cursor: ew-resize;
    border-radius: 5px;
  }

  &-corner {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -6px;
    border-radius: 6px;
  }

  &:hover {
    background: rgba(125, 125, 125, 0.1);
  }
}
</style>

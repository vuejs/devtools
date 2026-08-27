<script setup lang="ts">
import { Components as ComponentsPanel } from '@vue/devtools-applet'
import { rpc } from '@vue/devtools-core'
import { isInChromePanel } from '@vue/devtools-shared'
import { openInEditor } from '../composables/open-in-editor'
import '@vue/devtools-applet/style.css'

function onInspectComponentStart() {
  if (isInChromePanel)
    return

  rpc.value.emit('toggle-panel', false)
}

function onInspectComponentEnd() {
  if (isInChromePanel)
    return

  rpc.value.emit('toggle-panel', true)
}
</script>

<template>
  <ComponentsPanel
    @open-in-editor="openInEditor"
    @on-inspect-component-start="onInspectComponentStart"
    @on-inspect-component-end="onInspectComponentEnd"
  />
</template>

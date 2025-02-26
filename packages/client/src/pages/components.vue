<script setup lang="ts">
import { Components as ComponentsPanel } from '@vue/devtools-applet'
import { rpc } from '@vue/devtools-core'
import { openInEditor } from '../composables/open-in-editor'
import '@vue/devtools-applet/style.css'

function onInspectComponentStart() {
  rpc.value.emit('toggle-panel', false)
}

function onInspectComponentEnd() {
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

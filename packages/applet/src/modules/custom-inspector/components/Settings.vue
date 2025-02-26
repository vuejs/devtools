<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, inject } from 'vue'
import DevToolsHeader from '~/components/basic/DevToolsHeader.vue'
import Navbar from '~/components/basic/Navbar.vue'
import Settings from '~/components/settings/Settings.vue'
import { useCustomInspectorState } from '~/composables/custom-inspector-state'

const settings = inject<Ref<{
  options: Record<string, unknown>
  values: Record<string, unknown>
}>>('pluginSettings')!
const customInspectState = useCustomInspectorState()
const options = computed(() => settings.value.options)
const values = computed(() => settings.value.values)

function update(_settings) {
  settings.value = _settings
}
</script>

<template>
  <div class="h-full flex flex-col">
    <DevToolsHeader :doc-link="customInspectState.homepage!">
      <Navbar />
    </DevToolsHeader>
    <Settings :plugin-id="customInspectState.pluginId!" :options="options" :values="values" @update="update" />
  </div>
</template>

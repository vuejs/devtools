<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, inject } from 'vue'
import DevToolsHeader from '~/components/basic/DevToolsHeader.vue'
import Navbar from '~/components/basic/Navbar.vue'
import Settings from '~/components/settings/Settings.vue'

const settings = inject<Ref<{
  options: Record<string, unknown>
  values: Record<string, unknown>
}>>('pluginSettings')!
const options = computed(() => settings.value.options)
const values = computed(() => settings.value.values)
const inspectorId = 'pinia'

function update(_settings) {
  settings.value = _settings
}
</script>

<template>
  <div class="h-full flex flex-col">
    <DevToolsHeader doc-link="https://pinia.vuejs.org/" github-repo-link="https://github.com/vuejs/pinia">
      <Navbar />
    </DevToolsHeader>
    <Settings plugin-id="dev.esm.pinia" :options="options" :values="values" @update="update" />
  </div>
</template>

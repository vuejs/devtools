<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useDevtoolsClient } from '../../composables/devtools-client'
import { useDevtoolsColorMode } from '../../composables/color-mode'
import { useDevtoolsSettings } from '../../composables/settings'

const { apps, selectApp, selectedAppId } = useDevtoolsClient()
const { dark, setDarkMode } = useDevtoolsColorMode()
const { settings } = useDevtoolsSettings()

const expandSidebar = computed({
  get: () => settings.expandSidebar,
  set: (value: boolean) => {
    settings.expandSidebar = value
  },
})

const selectedAppValue = computed({
  get: () => selectedAppId.value ?? '',
  set: (value: string) => {
    if (value) selectApp(value)
  },
})

function refreshPage() {
  window.location.reload()
}
</script>

<template>
  <div class="bg-base color-base">
    <div class="flex gap-2 border-b border-base px-3 py-2">
      <button
        class="settings-button text-primary-700 dark:text-primary-300"
        type="button"
        @click="setDarkMode(!dark)"
      >
        <span :class="dark ? 'i-carbon-moon' : 'i-carbon-sun'" aria-hidden="true" />
        {{ dark ? 'Dark' : 'Light' }}
      </button>

      <button
        class="settings-button text-primary-700 dark:text-primary-300"
        type="button"
        @click="expandSidebar = !expandSidebar"
      >
        <span
          :class="expandSidebar ? 'i-carbon-side-panel-close' : 'i-carbon-side-panel-open'"
          aria-hidden="true"
        />
        {{ expandSidebar ? 'Minimize Sidebar' : 'Expand Sidebar' }}
      </button>

      <RouterLink class="settings-button settings-button-primary no-underline" to="/settings">
        <span class="i-carbon-settings-adjust" aria-hidden="true" />
        Settings
      </RouterLink>
    </div>

    <div class="flex gap-2 px-3 py-2">
      <select
        v-if="apps.length > 1"
        v-model="selectedAppValue"
        class="settings-select min-w-44"
        aria-label="Toggle app"
      >
        <option v-for="app in apps" :key="app.id" :value="app.id">
          {{ app.name }}{{ app.version ? ` (${app.version})` : '' }}
        </option>
      </select>

      <button class="settings-button" type="button" @click="refreshPage">
        <span class="i-carbon-renew" aria-hidden="true" />
        Refresh Page
      </button>
    </div>
  </div>
</template>

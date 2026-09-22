<script setup lang="ts">
import { provideColorScheme } from '@antfu/design/composables/colorScheme'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayVersion from '@antfu/design/components/Display/DisplayVersion.vue'
import { version } from 'vue'

provideColorScheme('dark')
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="app-brand">
        <span class="brand-mark" aria-hidden="true">V</span>
        <span>Vue Playground</span>
        <DisplayBadge :color="false" rounded="full"
          ><DisplayVersion :version="version"
        /></DisplayBadge>
      </div>
      <nav class="app-nav" aria-label="Playground pages">
        <RouterLink to="/dashboard">Dashboard</RouterLink>
        <RouterLink to="/projects">Projects</RouterLink>
        <RouterLink to="/performance">Performance</RouterLink>
      </nav>
    </header>

    <RouterView />
  </main>
</template>

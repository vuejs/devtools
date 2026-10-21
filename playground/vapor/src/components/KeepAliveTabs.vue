<script setup vapor lang="ts">
import { shallowRef } from 'vue'
import TabAlpha from './TabAlpha.vue'
import TabBeta from './TabBeta.vue'

const tabs = { alpha: TabAlpha, beta: TabBeta }
const current = shallowRef<keyof typeof tabs>('alpha')
</script>

<template>
  <div class="card">
    <h3 class="card-title">KeepAlive + dynamic component</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="current = 'alpha'">Alpha</button>
      <button class="btn-action-sm" @click="current = 'beta'">Beta</button>
    </div>
    <KeepAlive>
      <component :is="tabs[current]" />
    </KeepAlive>
  </div>
</template>

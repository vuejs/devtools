<script setup lang="ts">
import { ref } from 'vue'
import VaporBridge from './VaporBridge.vue'

const showBridge = ref(true)
</script>

<template>
  <div class="card">
    <h3 class="card-title">VDOM root</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="showBridge = !showBridge">
        {{ showBridge ? 'Unmount' : 'Mount' }} Vapor child
      </button>
    </div>
    <VaporBridge v-if="showBridge" />
  </div>
</template>

<script setup vapor lang="ts">
import { ref } from 'vue'
import VdomLeaf from './VdomLeaf.vue'

const count = ref(0)
</script>

<template>
  <div class="card">
    <h3 class="card-title">Vapor child of a VDOM parent</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="count++">count: {{ count }}</button>
    </div>
    <VdomLeaf :count="count" />
  </div>
</template>

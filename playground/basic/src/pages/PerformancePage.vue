<script setup lang="ts">
import { storeToRefs } from 'pinia'
import RenderCluster from '../components/RenderCluster.vue'
import { useLabStore } from '../stores/lab'

const lab = useLabStore()
const { renderSize, selectedTrack } = storeToRefs(lab)
const { addActivity, setRenderSize } = lab

const sizes = [96, 1000, 5000, 20_000]
</script>

<template>
  <section class="page-grid">
    <div class="page-header">
      <p class="eyebrow">Rendering</p>
      <h1>Performance</h1>
      <p>Adjust the node count and track to inspect component updates.</p>
    </div>

    <section class="surface control-strip">
      <div>
        <label for="track">Track</label>
        <select id="track" v-model="selectedTrack">
          <option value="runtime">runtime</option>
          <option value="router">router</option>
          <option value="timeline">timeline</option>
          <option value="pinia">pinia</option>
        </select>
      </div>

      <div class="node-controls">
        <label>Nodes</label>
        <div class="segmented" role="group" aria-label="Node count">
          <button
            v-for="size in sizes"
            :key="size"
            type="button"
            :class="{ active: renderSize === size }"
            :aria-pressed="renderSize === size"
            @click="setRenderSize(size)"
          >
            {{ size.toLocaleString('en-US') }}
          </button>
        </div>
      </div>

      <button type="button" @click="addActivity(`Rendered ${renderSize} nodes`)">
        Record render
      </button>
    </section>

    <section class="surface">
      <div class="cluster-heading">
        <h2>Render nodes</h2>
        <span class="muted"
          >{{ renderSize.toLocaleString('en-US') }} components · {{ selectedTrack }} · 12
          branches</span
        >
      </div>
      <RenderCluster :count="renderSize" :active-track="selectedTrack" />
    </section>
  </section>
</template>

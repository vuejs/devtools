<script setup lang="ts">
import type { ActivityItem } from '../data/fixtures'

defineProps<{
  items: ActivityItem[]
}>()
</script>

<template>
  <section class="surface activity-feed">
    <div class="section-heading">
      <p class="eyebrow">Live signals</p>
      <h2>Activity feed</h2>
    </div>

    <ol class="activity-list">
      <li v-for="item in items" :key="item.id" class="activity-row" :class="item.level">
        <span class="activity-dot" aria-hidden="true" />
        <div>
          <strong>{{ item.title }}</strong>
          <span>{{ item.source }} - {{ item.minutesAgo }}m ago</span>
        </div>
      </li>
    </ol>
  </section>
</template>

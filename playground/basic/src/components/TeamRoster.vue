<script setup lang="ts">
import type { TeamMember } from '../data/fixtures'

defineProps<{
  members: TeamMember[]
}>()
</script>

<template>
  <section class="surface roster">
    <div class="section-heading">
      <p class="eyebrow">Component branches</p>
      <h2>Team roster</h2>
    </div>

    <ul class="roster-list">
      <li v-for="member in members" :key="member.id">
        <div>
          <strong>{{ member.name }}</strong>
          <span>{{ member.role }} - {{ member.focus }}</span>
        </div>
        <meter min="0" max="100" :value="member.load">{{ member.load }}%</meter>
      </li>
    </ul>
  </section>
</template>

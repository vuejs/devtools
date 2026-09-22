<script setup lang="ts">
import type { Project } from '../data/fixtures'
import { computed } from 'vue'

const props = defineProps<{
  project: Project
  pinned: boolean
}>()

defineEmits<{
  'toggle-pin': [projectId: number]
}>()

const completed = computed(() =>
  props.project.groups.reduce(
    (sum, group) => sum + group.tasks.filter((task) => task.done).length,
    0,
  ),
)
const total = computed(() =>
  props.project.groups.reduce((sum, group) => sum + group.tasks.length, 0),
)
</script>

<template>
  <article class="surface project-card">
    <div class="project-card-header">
      <div>
        <p class="eyebrow">{{ project.status }}</p>
        <h2>{{ project.name }}</h2>
      </div>
      <button class="quiet-button" type="button" @click="$emit('toggle-pin', project.id)">
        {{ pinned ? 'Pinned' : 'Pin' }}
      </button>
    </div>

    <p>{{ project.summary }}</p>

    <div class="project-progress">
      <span>Score {{ project.score }}</span>
      <span>{{ completed }} / {{ total }} tasks</span>
    </div>

    <RouterLink class="text-link" :to="`/projects/${project.slug}`">Open route detail</RouterLink>
  </article>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ProjectCard from '../components/ProjectCard.vue'
import { useLabStore } from '../stores/lab'

const lab = useLabStore()
const { pinnedProjectIds, projectList } = storeToRefs(lab)
const { togglePin } = lab
const filter = ref<'all' | 'healthy' | 'watch' | 'blocked'>('all')

const filteredProjects = computed(() =>
  filter.value === 'all'
    ? projectList.value
    : projectList.value.filter((project) => project.status === filter.value),
)
</script>

<template>
  <section class="page-grid">
    <div class="page-header split-header">
      <div>
        <p class="eyebrow">Router tab fixture</p>
        <h1>Projects</h1>
        <p>Each detail button navigates to a dynamic route with nested task components.</p>
      </div>

      <select v-model="filter" aria-label="Filter projects">
        <option value="all">All</option>
        <option value="healthy">Healthy</option>
        <option value="watch">Watch</option>
        <option value="blocked">Blocked</option>
      </select>
    </div>

    <div class="project-grid">
      <ProjectCard
        v-for="project in filteredProjects"
        :key="project.id"
        :project="project"
        :pinned="pinnedProjectIds.includes(project.id)"
        @toggle-pin="togglePin"
      />
    </div>
  </section>
</template>

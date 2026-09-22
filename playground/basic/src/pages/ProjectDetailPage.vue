<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MetricTile from '../components/MetricTile.vue'
import TaskGroup from '../components/TaskGroup.vue'
import { useLabStore } from '../stores/lab'

const props = defineProps<{
  slug: string
}>()

const lab = useLabStore()
const { projectList, pinnedProjectIds } = storeToRefs(lab)
const { completeTask, togglePin } = lab

const project = computed(() => projectList.value.find((item) => item.slug === props.slug))
const taskCount = computed(
  () => project.value?.groups.reduce((sum, group) => sum + group.tasks.length, 0) ?? 0,
)
const completed = computed(
  () =>
    project.value?.groups.reduce(
      (sum, group) => sum + group.tasks.filter((task) => task.done).length,
      0,
    ) ?? 0,
)
const isPinned = computed(() =>
  project.value ? pinnedProjectIds.value.includes(project.value.id) : false,
)
</script>

<template>
  <section v-if="project" class="page-grid">
    <div class="page-header detail-header">
      <div>
        <p class="eyebrow">{{ project.status }}</p>
        <h1>{{ project.name }}</h1>
        <p>{{ project.summary }}</p>
      </div>
      <button type="button" @click="togglePin(project.id)">
        {{ isPinned ? 'Unpin project' : 'Pin project' }}
      </button>
    </div>

    <div class="metrics-grid compact-grid">
      <MetricTile label="Owner" :value="project.owner" detail="Route prop detail" />
      <MetricTile label="Score" :value="project.score" detail="Project health" />
      <MetricTile label="Tasks" :value="`${completed}/${taskCount}`" detail="Nested groups" />
    </div>

    <TaskGroup
      v-for="group in project.groups"
      :key="group.id"
      :group="group"
      @complete-task="completeTask"
    />
  </section>

  <section v-else class="page-grid">
    <div class="surface empty-state">
      <p class="eyebrow">Missing route</p>
      <h1>Project not found</h1>
      <RouterLink class="text-link" to="/projects">Back to projects</RouterLink>
    </div>
  </section>
</template>

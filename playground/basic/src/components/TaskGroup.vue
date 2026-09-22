<script setup lang="ts">
import type { TaskGroup } from '../data/fixtures'

defineProps<{
  group: TaskGroup
}>()

defineEmits<{
  'complete-task': [taskId: number]
}>()
</script>

<template>
  <section class="surface task-group">
    <div class="section-heading compact">
      <p class="eyebrow">{{ group.tasks.length }} tasks</p>
      <h2>{{ group.label }}</h2>
    </div>

    <ul class="task-list">
      <li v-for="task in group.tasks" :key="task.id" class="task-row">
        <label>
          <input type="checkbox" :checked="task.done" @change="$emit('complete-task', task.id)" />
          <span :class="{ done: task.done }">{{ task.title }}</span>
        </label>
        <span>{{ task.owner }} - {{ task.cost }}pt</span>
      </li>
    </ul>
  </section>
</template>

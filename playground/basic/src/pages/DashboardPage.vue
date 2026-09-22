<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import ActivityFeed from '../components/ActivityFeed.vue'
import MetricTile from '../components/MetricTile.vue'
import TeamRoster from '../components/TeamRoster.vue'
import { useCounterStore } from '../stores/counter'
import { useLabStore } from '../stores/lab'

const counter = useCounterStore()
const lab = useLabStore()
const { completedTodos, count, doubled, name, profile, todos } = storeToRefs(counter)
const { activityLog, averageScore, completedTasks, members, pinnedProjects, totalTasks } =
  storeToRefs(lab)
const { addTodo, decrement, increment, reset, toggleTodo } = counter
const { addActivity } = lab

const parity = computed(() => (count.value % 2 === 0 ? 'even' : 'odd'))

// Intentionally unread so Components can show "not accessed" without running the getter.
const unreadComputed = computed(() => 'should-not-appear')
</script>

<template>
  <section class="page-grid dashboard-grid">
    <div class="page-header">
      <p class="eyebrow">State & components</p>
      <h1>{{ name }}</h1>
      <p>Update state, inspect components, and follow changes across routes.</p>
    </div>

    <div class="metrics-grid">
      <MetricTile label="Projects" :value="pinnedProjects.length" detail="Pinned route branches" />
      <MetricTile
        label="Task progress"
        :value="`${completedTasks}/${totalTasks}`"
        detail="Nested task rows"
      />
      <MetricTile label="Average score" :value="averageScore" detail="Computed from store" />
      <MetricTile label="Counter" :value="count" :detail="`Doubled ${doubled} - ${parity}`" />
    </div>

    <section class="surface counter-panel">
      <div class="section-heading">
        <p class="eyebrow">Pinia state</p>
        <h2>Counter controls</h2>
      </div>

      <div class="counter">
        <button type="button" aria-label="Decrement count" @click="decrement">-</button>
        <div>
          <span class="count">{{ count }}</span>
          <span class="muted">score {{ profile.nested.score }}</span>
        </div>
        <button type="button" aria-label="Increment count" @click="increment">+</button>
      </div>

      <div class="actions">
        <button type="button" @click="addTodo">Add todo</button>
        <button type="button" @click="addActivity()">Log activity</button>
        <button type="button" class="secondary" @click="reset">Reset</button>
      </div>

      <ul class="todos">
        <li v-for="todo in todos" :key="todo.id">
          <label>
            <input type="checkbox" :checked="todo.done" @change="toggleTodo(todo.id)" />
            <span :class="{ done: todo.done }">{{ todo.text }}</span>
          </label>
        </li>
      </ul>

      <p class="muted">Completed {{ completedTodos }} / {{ todos.length }}</p>
    </section>

    <TeamRoster :members="members" />
    <ActivityFeed :items="activityLog.slice(0, 6)" />
  </section>
</template>

<script setup vapor lang="ts">
import { ref } from 'vue'
import TodoItem from './TodoItem.vue'

interface Todo {
  id: number
  text: string
  done: boolean
}

let nextId = 3
const todos = ref<Todo[]>([
  { id: 1, text: 'Walk the Vapor block tree', done: false },
  { id: 2, text: 'Highlight Vapor components', done: false },
])

function add() {
  todos.value.push({ id: nextId, text: `Todo #${nextId}`, done: false })
  nextId++
}

function remove(id: number) {
  todos.value = todos.value.filter((todo) => todo.id !== id)
}

function reverse() {
  todos.value = [...todos.value].reverse()
}
</script>

<template>
  <div class="card">
    <h3 class="card-title">Keyed v-for</h3>
    <div class="flex items-center gap-2">
      <button class="btn-action-sm" @click="add">Add</button>
      <button class="btn-action-sm" @click="reverse">Reverse</button>
    </div>
    <TodoItem
      v-for="todo in todos"
      :key="todo.id"
      :todo="todo"
      @toggle="todo.done = !todo.done"
      @remove="remove(todo.id)"
    />
  </div>
</template>

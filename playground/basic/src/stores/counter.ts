import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

interface Todo {
  id: number
  text: string
  done: boolean
}

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const name = ref('Pinia playground')
  const todos = ref<Todo[]>([
    { id: 1, text: 'Open Vue Devtools', done: true },
    { id: 2, text: 'Inspect the Pinia tab', done: false },
  ])
  const profile = ref({
    owner: 'devtools',
    nested: {
      enabled: true,
      score: 42,
    },
  })

  const doubled = computed(() => count.value * 2)
  const completedTodos = computed(() => todos.value.filter((todo) => todo.done).length)

  function increment() {
    count.value++
  }

  function decrement() {
    count.value--
  }

  function reset() {
    count.value = 0
    profile.value.nested.score = 42
  }

  function addTodo() {
    const id = Date.now()
    todos.value.push({
      id,
      text: `Store action ${todos.value.length + 1}`,
      done: false,
    })
  }

  function toggleTodo(id: number) {
    const todo = todos.value.find((item) => item.id === id)
    if (todo) todo.done = !todo.done
  }

  return {
    count,
    name,
    todos,
    profile,
    doubled,
    completedTodos,
    increment,
    decrement,
    reset,
    addTodo,
    toggleTodo,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCounterStore, import.meta.hot))
}

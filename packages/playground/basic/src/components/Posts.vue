<script lang="ts">
import type { Post } from './types'
import { useQuery } from '@tanstack/vue-query'

import { defineComponent } from 'vue'

const fetcher = async (): Promise<Post[]> =>
  await fetch('https://jsonplaceholder.typicode.com/posts').then(response =>
    response.json(),
  )

export default defineComponent({
  name: 'PostsList',
  props: {
    isVisited: {
      type: Function,
      required: true,
    },
  },
  emits: ['setPostId'],
  setup() {
    const { isPending, isError, isFetching, data, error, refetch } = useQuery({
      queryKey: ['posts'],
      queryFn: fetcher,
    })

    return { isPending, isError, isFetching, data, error, refetch }
  },
})
</script>

<template>
  <h1>Posts</h1>
  <div v-if="isPending">
    Loading...
  </div>
  <div v-else-if="isError">
    An error has occurred: {{ error }}
  </div>
  <div v-else-if="data">
    <ul>
      <li v-for="item in data" :key="item.id" class="list-none">
        <a
          href="#"
          :class="{ visited: isVisited(item.id) }"
          @click="$emit('setPostId', item.id)"
        >{{ item.title }}</a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.visited {
  font-weight: bold;
  color: green;
}
</style>

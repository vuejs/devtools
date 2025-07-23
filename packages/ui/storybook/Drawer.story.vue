<script setup lang="ts">
import { ref } from 'vue'
import Drawer from '../src/components/Drawer.vue'

const modalShow = ref(false)

const placement = ref<'left' | 'right' | 'top' | 'bottom'>('right')
</script>

<template>
  <Story>
    <template #controls>
      <HstSelect
        v-model="placement"
        title="Placement"
        :options="['left', 'right', 'top', 'bottom']"
      />
    </template>
    <div class="container relative h-500px w-full">
      <HstButton @click="modalShow = true">
        Show Drawer
      </HstButton>
      <Drawer v-model="modalShow" content-class="w100px bg-red" mount-to=".container" :placement="placement">
        <div>
          1
        </div>
      </Drawer>
    </div>
  </Story>
</template>

<script setup vapor lang="ts">
import { ref } from 'vue'
import ConditionalPanel from './components/ConditionalPanel.vue'
import CounterCard from './components/CounterCard.vue'
import FragmentRoot from './components/FragmentRoot.vue'
import KeepAliveTabs from './components/KeepAliveTabs.vue'
import SlotFrame from './components/SlotFrame.vue'
import TeleportNotice from './components/TeleportNotice.vue'
import TextOnly from './components/TextOnly.vue'
import TodoList from './components/TodoList.vue'

const total = ref(0)
</script>

<template>
  <div>
    <p class="mb-3 text-xs color-muted">Total clicks: {{ total }}</p>
    <CounterCard label="Primary counter" :step="1" @change="total++" />
    <CounterCard label="Step counter" :step="5" @change="total++" />
    <TodoList />
    <ConditionalPanel />
    <SlotFrame title="Slot frame">
      <template #default>
        <CounterCard label="Counter in slot" :step="2" @change="total++" />
      </template>
      <template #footer>
        <TextOnly />
      </template>
    </SlotFrame>
    <FragmentRoot />
    <KeepAliveTabs />
    <TeleportNotice />
  </div>
</template>

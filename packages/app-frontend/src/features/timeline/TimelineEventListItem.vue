<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent } from 'vue'
import { formatTime } from '@front/util/format'
import type { TimelineEvent } from './composable'
import { useInspectedEvent } from './composable'

export default defineComponent({
  props: {
    event: {
      type: Object as PropType<TimelineEvent>,
      required: true,
    },

    selected: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['inspect', 'select'],

  setup(props) {
    const time = computed(() => formatTime(props.event.time / 1000))

    const {
      inspectedEvent,
    } = useInspectedEvent()

    const isInspected = computed(() => inspectedEvent.value === props.event)

    return {
      time,
      isInspected,
    }
  },
})
</script>

<template>
  <div
    class="event flex items-center space-x-2 pl-3 pr-2 text-xs cursor-pointer select-none"
    :class="{
      'inspected bg-green-500 text-white': isInspected,
      'hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-800 dark:text-gray-200': !isInspected,
    }"
    @click="$emit('inspect')"
    @dblclick="$emit('select')"
  >
    <span class="flex-1 font-mono truncate space-x-1">
      <span
        class="font-medium"
        :class="{
          'text-purple-600 dark:text-purple-400': !isInspected,
        }"
      >
        <span>{{ event.title || 'Event' }}</span>

        <VueIcon
          v-if="event.logType === 'error'"
          icon="error"
          class="w-4 h-4 ml-1"
          :class="{
            'text-red-500': !isInspected,
            'text-white': isInspected,
          }"
        />

        <VueIcon
          v-if="event.logType === 'warning'"
          icon="warning"
          class="w-4 h-4 ml-1"
          :class="{
            'text-yellow-500': !isInspected,
            'text-white': isInspected,
          }"
        />
      </span>

      <span
        v-if="event.subtitle"
        class="opacity-75"
        v-html="event.subtitle"
      />
    </span>

    <span
      v-if="selected"
      class="flex-none text-2xs px-1 py-0.5 leading-none rounded-full text-green-500 border"
      :class="{
        'bg-white border-transparent': isInspected,
        'bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-800': !isInspected,
      }"
    >
      selected
    </span>

    <span class="event-time flex-none text-2xs font-mono opacity-50">
      {{ time }}
    </span>
  </div>
</template>

<style lang="postcss" scoped>
.event {
  height: 34px;
}
</style>

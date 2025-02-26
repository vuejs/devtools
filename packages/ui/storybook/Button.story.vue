<script setup lang="ts">
import type { ButtonType } from '../src/components/Button.vue'
import { logEvent } from 'histoire/client'
import { reactive, ref } from 'vue'
import Badge from '../src/components/Badge.vue'
import Button from '../src/components/Button.vue'
import Icon from '../src/components/Icon.vue'

const state = reactive<{
  type: ButtonType
}>({
  type: 'default',
})

const flat = ref(false)
const outlined = ref(false)
</script>

<template>
  <Story>
    <template #controls>
      <HstSelect
        v-model="state.type"
        title="Type"
        :options="{
          default: 'Default',
          primary: 'Primary',
          accent: 'Accent',
          danger: 'Danger',
          warning: 'Warning',
          info: 'Info',
          success: 'Success',
        }"
      />
      <HstCheckbox v-model="flat" title="Flat" />
      <HstCheckbox v-model="outlined" title="Outlined" />
    </template>
    <Variant title="Normal Button">
      <Button :flat="flat" :outlined="outlined" :type="state.type" @click="logEvent('click event', $event)">
        Button
      </Button>
    </Variant>
    <Variant title="A Button">
      <Button :flat="flat" :outlined="outlined" href="https://vuejs.org" :type="state.type">
        A Button
      </Button>
    </Variant>
    <Variant title="RouterLink Button">
      <Button :flat="flat" :outlined="outlined" to="router-path" :type="state.type">
        RouterLink Button
      </Button>
    </Variant>
    <Variant title="Round Button">
      <Button :flat="flat" :outlined="outlined" round="full" :type="state.type">
        Round Button
      </Button>
    </Variant>
    <Variant title="Loading Button">
      <Button :flat="flat" :outlined="outlined" loading :type="state.type">
        Loading Button
      </Button>
    </Variant>
    <Variant title="With Icon">
      <Button :flat="flat" :outlined="outlined" :type="state.type">
        <template #icon>
          <Icon class="i-carbon-moon" />
        </template>
        Icon Button
      </Button>
    </Variant>
    <Variant title="With Badge">
      <Button :flat="flat" :outlined="outlined" :type="state.type">
        Badge Button
        <Badge>10</Badge>
      </Button>
    </Variant>
    <Variant title="Mini Button">
      <Button :flat="flat" :outlined="outlined" :type="state.type" size="mini">
        <template #icon>
          <Icon icon="i-material-symbols-more-vert" />
        </template>
      </Button>
    </Variant>
    <Variant title="Padding">
      <div class="p5">
        <Button :flat="flat" :outlined="outlined" :type="state.type">
          123
        </Button>
      </div>
    </Variant>
  </Story>
</template>

<docs lang="md">
### Button Note

`loading` and `icon` slot are mutually exclusive, only render one of them at a time.
</docs>

<script setup lang="ts">
import { isDark as getIsDark, toggleDark } from 'histoire/client'
import { computed } from 'vue'
import Button from '../src/components/Button.vue'
import DarkToggle from '../src/components/DarkToggle.vue'
import Icon from '../src/components/Icon.vue'

const dark = computed({
  get: () => getIsDark(),
  set: (v) => {
    toggleDark(v)
    window.document.documentElement.classList.toggle('dark', v)
  },
})
</script>

<template>
  <Story>
    <Variant title="With Animation">
      <DarkToggle v-model:is-dark="dark">
        <template #default="{ toggle, isDark }">
          <Button
            @click="(e) => {
              toggle(e)
            }"
          >
            <Icon :class="isDark ? 'i-carbon-moon' : 'i-carbon-sun'" />
          </Button>
        </template>
      </DarkToggle>
    </Variant>
    <Variant title="No Animation">
      <DarkToggle v-model:is-dark="dark" :animation="false">
        <template #default="{ toggle, isDark }">
          <Button
            @click="(e) => {
              toggle(e)
            }"
          >
            <Icon :class="isDark ? 'i-carbon-moon' : 'i-carbon-sun'" />
          </Button>
        </template>
      </DarkToggle>
    </Variant>
  </Story>
</template>

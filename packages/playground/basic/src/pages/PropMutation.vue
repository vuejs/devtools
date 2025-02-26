<script setup lang="ts">
import PropChild from '../components/PropChild.vue'

const props = {
  bool: ref(false),
  num: ref(0),
  str: ref('hey'),
  obj: ref({
    foo: 'bar',
  }),
}
</script>

<template>
  <div>
    <div>Prop Page</div>
    <PropChild
      v-bind="{
        bool: props.bool.value,
        num: props.num.value,
        str: props.str.value,
        obj: props.obj.value,
      }"
    />
  </div>
</template>

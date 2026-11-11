<script setup>
defineProps(['visible', 'items'])
</script>

<template>
  <section>
    <p v-if="visible">Visible</p>
    <p v-else>Hidden</p>
    <ul>
      <li v-for="item in items" :key="item.id">{{ item.label }}</li>
    </ul>
  </section>
</template>

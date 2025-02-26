<script setup lang="ts">

</script>

<template>
  <div class="flex flex-col justify-center">
    <div class="text-center">
      <RouterView />
    </div>
    <div class="text-center">
      Router Navgation:
      <RouterLink to="/">
        <span>
          /
        </span>
      </RouterLink>
      |
      <RouterLink to="/hello">
        <span>
          /hello
        </span>
      </RouterLink>
      |
      <RouterLink to="/hey/123123">
        <span>
          /hey/123123
        </span>
      </RouterLink>
      |
      <RouterLink to="/prop-mutation">
        <span>
          Prop mutation
        </span>
      </RouterLink>
    </div>
  </div>
</template>

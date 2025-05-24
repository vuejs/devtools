<script setup lang="ts">
import Srcdoc from './srcdoc.html?raw'
</script>

<template>
  <div class="m-auto mt-5 h-30 w-60 flex flex-col items-center justify-center rounded bg-[#363636]">
    <iframe
      sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
      :srcdoc="Srcdoc"
    />
  </div>
</template>

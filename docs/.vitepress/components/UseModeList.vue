<script setup lang="ts">
const list = [
  {
    name: 'Vite Plugin',
    logo: '/features/vite-logo.svg',
    link: '/guide/vite-plugin',
  },
  {
    name: 'Standalone App',
    logo: '/features/electron-logo.svg',
    link: '/guide/standalone',
  },
  {
    name: 'Chrome Extension',
    logo: '/features/chrome-logo.svg',
    link: '/guide/browser-extension',
  },
  {
    name: 'Firefox Extension',
    logo: '/features/firefox-logo.svg',
    link: '/guide/browser-extension#firefox',
  },
]
</script>

<template>
  <ul class="flex flex-col mx-0! px-0!">
    <li
      v-for="(item, index) in list"
      :key="index"
      class="group cursor-pointer list-none rounded pr-5 hover:b-$vp-c-brand-1"
      border="~ solid base" flex="~ flex-row items-center"
    >
      <a
        :href="item.link"
        class="group text-! h-full w-full flex cursor-pointer list-none items-center rounded pr-5 hover:b-$vp-c-brand-1 text-$vp-c-text-1! decoration-none!"
      >
        <img :src="item.logo" :alt="item.name" class="mx-2 h-10">
        <p class="group-hover:text-$vp-c-brand-1">
          {{ item.name }}
        </p>
      </a>
    </li>
  </ul>
</template>

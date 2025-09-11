<script setup lang="ts">
const { fileTypeData, fileTypeShow, toggleFileType } = useFileTypes()
</script>

<template>
  <div

    absolute bottom-0 grid grid-cols-3 w-260px gap-2 b-1 b-l-0 border-base rounded-tr-lg glass-effect px4 py2 text-sm transition-transform duration-300
    class="group"
    :class="{
      'translate-x-[calc(-100%+30px)] translate-y-[calc(100%-30px)]': !fileTypeShow,
    }"
  >
    <div
      class="group"
      absolute right-0 h30px w30px cursor-pointer rounded-tr-lg bg-primary-500 text-white transition-opacity flex="~ justify-center items-center"
      :class="{
        'rounded-bl-lg opacity-0 group-hover:opacity-100': fileTypeShow,
      }"
      @click="() => toggleFileType()"
    >
      <div
        transition-transform
        :class="[
          fileTypeShow
            ? 'i-material-symbols-arrow-downward-alt rotate-45 hover:(translate-x--10% translate-y-10%)'
            : 'i-mdi-file-outline',
        ]"
      />
    </div>
    <div v-for="item of fileTypeData" :key="item.key" flex items-center gap-2>
      <div
        h12px w12px rounded-full :style="{
          backgroundColor: item.color,
        }"
      />
      <span
        :class="[
          item.capitalize ? 'capitalize' : 'uppercase',
        ]"
      >{{ item.key }}</span>
    </div>
  </div>
</template>

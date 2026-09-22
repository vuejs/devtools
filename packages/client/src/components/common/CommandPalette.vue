<script setup lang="ts">
import type { DevtoolsCommand } from '../../composables/commands'
import { toRef } from 'vue'
import { useCommandPalette } from '../../composables/command-palette'

const props = defineProps<{
  commands: readonly DevtoolsCommand[]
}>()

const {
  activeDescendant,
  nested,
  commandElementId,
  commandError,
  commandPath,
  dialog,
  filteredCommands,
  groupedCommands,
  goBack,
  onCancel,
  onDialogClick,
  runCommand,
  runningCommandId,
  search,
  searchInput,
  selectedIndex,
} = useCommandPalette(toRef(props, 'commands'))
</script>

<template>
  <dialog
    ref="dialog"
    class="command-palette max-h-[min(70vh,38rem)] max-w-[calc(100vw-2rem)] w-160 overflow-hidden border border-base rounded-2 bg-base p-0 color-base shadow-2xl"
    aria-label="Vue DevTools command palette"
    @cancel="onCancel"
    @click="onDialogClick"
  >
    <div class="max-h-[min(70vh,38rem)] flex flex-col">
      <div class="border-b border-base px-4 py-3 flex items-center gap-3">
        <button
          v-if="nested"
          class="h-7 w-7 shrink-0 border-0 rounded-1 bg-transparent color-muted flex items-center justify-center hover:bg-active hover:color-base"
          type="button"
          aria-label="Back to previous commands"
          @click="goBack"
        >
          <span class="i-carbon-arrow-left" aria-hidden="true" />
        </button>
        <span v-else class="i-carbon-search shrink-0 text-lg color-muted" aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="search"
          class="min-w-0 flex-auto border-0 bg-transparent color-base text-base outline-none"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="command-palette-list"
          :aria-activedescendant="activeDescendant"
          aria-expanded="true"
          placeholder="Type a command..."
        />
        <kbd class="rounded-1 border border-base bg-active px-1.5 py-0.5 text-xs color-muted">
          Esc
        </kbd>
      </div>

      <div
        v-if="nested"
        class="border-b border-base px-4 py-2 text-xs color-muted flex items-center gap-1"
      >
        <span>Commands</span>
        <template v-for="segment of commandPath" :key="segment">
          <span aria-hidden="true">/</span>
          <span class="color-base">{{ segment }}</span>
        </template>
      </div>

      <div id="command-palette-list" class="min-h-30 flex-auto overflow-auto p-2" role="listbox">
        <template v-if="filteredCommands.length">
          <section v-for="[group, commands] of groupedCommands" :key="group" class="mb-2 last:mb-0">
            <h2 class="m-0 px-2 py-1 text-11px font-600 tracking-wide color-muted uppercase">
              {{ group }}
            </h2>
            <button
              v-for="command of commands"
              :id="commandElementId(command.id)"
              :key="command.id"
              class="w-full border-0 rounded-1 bg-transparent px-2 py-2 color-base flex items-center gap-3 text-left hover:bg-active"
              :class="filteredCommands.indexOf(command) === selectedIndex ? 'bg-active' : ''"
              :data-command-index="filteredCommands.indexOf(command)"
              role="option"
              type="button"
              :aria-busy="runningCommandId === command.id"
              :aria-selected="filteredCommands.indexOf(command) === selectedIndex"
              @click="runCommand(command)"
              @pointerenter="selectedIndex = filteredCommands.indexOf(command)"
            >
              <span :class="command.icon" class="shrink-0 text-lg" aria-hidden="true" />
              <span class="min-w-0 flex-auto">
                <span class="block truncate">{{ command.title }}</span>
                <span v-if="command.description" class="block truncate text-xs color-muted">
                  {{ command.description }}
                </span>
              </span>
              <span
                v-if="runningCommandId === command.id"
                class="i-carbon-circle-dash shrink-0 animate-spin color-muted"
                aria-label="Running"
              />
              <span v-else class="i-carbon-return shrink-0 color-muted" aria-hidden="true" />
            </button>
          </section>
        </template>
        <div v-else class="min-h-28 color-muted flex items-center justify-center">
          No matching commands
        </div>
      </div>

      <div
        v-if="commandError"
        class="border-t border-base bg-red-500/8 px-4 py-2 text-sm text-red-600 dark:text-red-300"
        role="alert"
      >
        {{ commandError }}
      </div>

      <footer class="border-t border-base px-4 py-2 text-xs color-muted flex items-center gap-3">
        <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span><kbd>Enter</kbd> Run</span>
        <span><kbd>Esc</kbd> Close</span>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.command-palette::backdrop {
  background: rgb(0 0 0 / 35%);
  backdrop-filter: blur(6px);
}
</style>

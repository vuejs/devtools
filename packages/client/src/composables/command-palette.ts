import type { MaybeRefOrGetter } from 'vue'
import type { DevtoolsCommand } from './commands'
import { computed, nextTick, onMounted, onUnmounted, ref, toValue, watch } from 'vue'
import { filterDevtoolsCommands } from './commands'

interface CommandLevel {
  commands: readonly DevtoolsCommand[]
  parent: DevtoolsCommand
}

export function useCommandPalette(commands: MaybeRefOrGetter<readonly DevtoolsCommand[]>) {
  const dialog = ref<HTMLDialogElement>()
  const searchInput = ref<HTMLInputElement>()
  const search = ref('')
  const selectedIndex = ref(0)
  const runningCommandId = ref<string>()
  const commandError = ref<string>()
  const commandLevels = ref<CommandLevel[]>([])
  const currentCommands = computed(
    () => commandLevels.value[commandLevels.value.length - 1]?.commands ?? toValue(commands),
  )
  const filteredCommands = computed(() =>
    filterDevtoolsCommands(currentCommands.value, search.value),
  )
  const nested = computed(() => commandLevels.value.length > 0)
  const commandPath = computed(() => commandLevels.value.map((level) => level.parent.title))
  const groupedCommands = computed(() => {
    const groups = new Map<string, DevtoolsCommand[]>()
    for (const command of filteredCommands.value) {
      const groupCommands = groups.get(command.group) ?? []
      groupCommands.push(command)
      groups.set(command.group, groupCommands)
    }
    return [...groups]
  })
  const activeDescendant = computed(() => {
    const command = filteredCommands.value[selectedIndex.value]
    return command ? commandElementId(command.id) : undefined
  })

  watch([search, () => toValue(commands)], () => {
    selectedIndex.value = 0
  })

  onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown, { capture: true })
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onWindowKeydown, { capture: true })
    if (dialog.value?.open) dialog.value.close()
  })

  async function openPalette() {
    search.value = ''
    selectedIndex.value = 0
    commandError.value = undefined
    commandLevels.value = []
    if (!dialog.value?.open) dialog.value?.showModal()
    await nextTick()
    searchInput.value?.focus()
  }

  function closePalette() {
    if (runningCommandId.value) return
    if (dialog.value?.open) dialog.value.close()
  }

  function togglePalette() {
    if (dialog.value?.open) closePalette()
    else void openPalette()
  }

  function onWindowKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase()
    if (key === 'k' && !event.shiftKey && (event.metaKey || event.ctrlKey || event.altKey)) {
      event.preventDefault()
      event.stopPropagation()
      togglePalette()
      return
    }

    if (!dialog.value?.open) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === 'Enter') {
      const command = filteredCommands.value[selectedIndex.value]
      if (!command) return
      event.preventDefault()
      void runCommand(command)
    }
  }

  function moveSelection(delta: number) {
    const count = filteredCommands.value.length
    if (!count) return
    selectedIndex.value = (selectedIndex.value + delta + count) % count
    void nextTick(() => {
      dialog.value
        ?.querySelector<HTMLElement>(`[data-command-index="${selectedIndex.value}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  async function runCommand(command: DevtoolsCommand) {
    if (runningCommandId.value) return
    runningCommandId.value = command.id
    commandError.value = undefined

    try {
      const childCommands = await command.action()
      runningCommandId.value = undefined
      if (childCommands) {
        commandLevels.value = [...commandLevels.value, { parent: command, commands: childCommands }]
        search.value = ''
        selectedIndex.value = 0
        await nextTick()
        searchInput.value?.focus()
        return
      }
      closePalette()
    } catch (error) {
      commandError.value = error instanceof Error ? error.message : String(error)
      runningCommandId.value = undefined
    }
  }

  function onCancel(event: Event) {
    event.preventDefault()
    if (nested.value) goBack()
    else closePalette()
  }

  function onDialogClick(event: MouseEvent) {
    if (event.target === dialog.value) closePalette()
  }

  function goBack() {
    if (!nested.value || runningCommandId.value) return
    commandLevels.value = commandLevels.value.slice(0, -1)
    search.value = ''
    selectedIndex.value = 0
    commandError.value = undefined
    void nextTick(() => searchInput.value?.focus())
  }

  return {
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
  }
}

function commandElementId(commandId: string): string {
  return `command-palette-${commandId.replace(/[^a-z0-9_-]/gi, '-')}`
}

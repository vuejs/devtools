import { useDevToolsState } from '@vue/devtools-core'
import { CustomCommand } from '@vue/devtools-kit'
import { randomStr } from '@vue/devtools-shared'
import equal from 'fast-deep-equal'
import { MaybeRefOrGetter } from 'vue'

export interface CommandItem {
  id: string
  title: string
  description?: string
  icon?: string
  order?: number
  action: () => void | CommandItem[] | Promise<CommandItem[] | void>
}

function uniqueById(items: CommandItem[]): CommandItem[] {
  const unique = new Map<number | string, CommandItem>()
  items.forEach(item => unique.set(item.id, item))
  return Array.from(unique.values())
}

const registeredCommands = reactive(new Map<string, MaybeRefOrGetter<CommandItem[]>>())

// @unocss-include
export function useCommands() {
  const { enabledFlattenTabs } = useAllTabs()
  const router = useRouter()
  const state = useDevToolsState()

  let cachedCustomCommands: CustomCommand[] = []

  const customCommands = computed(() => {
    if (equal(state.commands.value, cachedCustomCommands))
      // Optimized computed value
      return cachedCustomCommands
    cachedCustomCommands = state.commands.value
    return state.commands.value
  })

  const fixedCommands: CommandItem[] = [
    {
      id: 'fixed:settings',
      title: 'Settings',
      icon: 'i-carbon-settings-adjust',
      action: () => {
        router.push('/settings')
      },
    },
    {
      id: 'fixed:docs',
      title: 'Vue Documentations',
      icon: 'i-vscode-icons-file-type-vue',
      action: () => {
        return getVueDocsCommands()
      },
    },
  ]

  const tabCommands = computed(() => enabledFlattenTabs.value
    .map((i): CommandItem => {
      return {
        id: `tab:${i.name}`,
        title: i.title || i.name,
        icon: i.icon,
        action: () => {
          if ('onClick' in i && i.onClick)
            i.onClick()
          else
            router.push(('path' in i && i.path) ? i.path : `/custom-tab-view/${i.name}`)
        },
      }
    }))

  return computed(() => {
    return uniqueById([
      ...fixedCommands,
      ...tabCommands.value,
      ...resolveCustomCommands(customCommands.value),
      ...Array.from(registeredCommands.values())
        .flatMap(i => toValue(i)),
    ])
  })
}

function resolveCustomAction(action: CustomCommand['action']) {
  if (action?.type === 'url')
    window.open(action.src, '_blank')
  // TODO: support more types
}

function resolveCustomCommands(commands: CustomCommand[]) {
  return commands.map(i => ({
    id: `${i.id}`,
    title: i.title,
    icon: i.icon,
    description: i.description,
    order: i.order,
    action: () => {
      // priority: children > url > undefined
      if (i.children) {
        return i.children.map(i => ({
          id: i.id,
          title: i.title,
          icon: i.icon,
          description: i.description,
          order: i.order,
          action: () => {
            resolveCustomAction(i.action)
          },
        })).sort((a, b) => {
          return (b.order ?? 0) - (a.order ?? 0)
        })
      }
      resolveCustomAction(i.action)
    },
  })).sort((a, b) => {
    return (b.order ?? 0) - (a.order ?? 0)
  })
}

export function registerCommands(getter: MaybeRefOrGetter<CommandItem[]>) {
  const id = randomStr()

  registeredCommands.set(id, getter)

  onUnmounted(() => {
    registeredCommands.delete(id)
  })
}

let _vueDocsCommands: CommandItem[] | undefined

const apiIconMapping = {
  'utility-types': 'i-mdi-language-typescript',
  'ssr': 'i-codicon-server-process',
  'custom-renderer': 'i-codicon-server-process',
  'sfc-script-setup': 'i-material-symbols:magic-button',
  'sfc-css-features': 'i-material-symbols-css',
  'built-in-directives': 'i-material-symbols-code',
  'built-in-special-attributes': 'i-material-symbols-code',
  'component-instance': 'i-material-symbols-code',
  'composition-api-dependency-injection': 'i-material-symbols-code',
  'composition-api-lifecycle': 'i-material-symbols-code',
  'general': 'i-material-symbols-code',
  'compile-time-flags': 'i-material-symbols-toggle-on',
  'reactivity-utilities': 'i-mdi-api',
  'reactivity-advanced': 'i-mdi-api',
  'render-function': 'i-mdi-api',
  '...others': 'i-uim-vuejs',
}

export async function getVueDocsCommands() {
  if (!_vueDocsCommands) {
    const list = await import('../../data/vue-apis.json').then(i => i.default)
    _vueDocsCommands = list.map(i => ({
      ...i,
      icon: apiIconMapping[i.description] ?? apiIconMapping['...others'],
      action: () => {
        window.open(i.url, '_blank')
      },
    }))
  }
  return _vueDocsCommands
}
